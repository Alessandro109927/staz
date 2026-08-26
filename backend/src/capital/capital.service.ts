import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bet } from '../bets/entities/bet.entity';
import { BetStatus } from '../common/enums/bet-status.enum';
import { Capital } from './entities/capital.entity';
import { SetCapitalDto } from './dto/set-capital.dto';
import { formatMoney, parseMoney } from '../common/decimal.util';

@Injectable()
export class CapitalService {
  constructor(
    @InjectRepository(Capital)
    private readonly capitalRepository: Repository<Capital>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
  ) {}

  async getCapital() {
    const record = await this.getCapitalEntity();
    if (!record) {
      return null;
    }

    await this.ensureStartingCapital(record);
    return this.mapCapital(record);
  }

  async setCapital(dto: SetCapitalDto) {
    const pendingCount = await this.betRepository.count();
    const existing = await this.getCapitalEntity();

    if (existing && pendingCount > 0 && !dto.reset) {
      throw new BadRequestException(
        'Esistono già scommesse registrate. Usa reset=true per reimpostare il capitale.',
      );
    }

    const formatted = formatMoney(dto.initialCapital);

    if (existing && dto.reset) {
      existing.initialCapital = formatted;
      existing.startingCapital = formatted;
      existing.currentCapital = formatted;
      const saved = await this.capitalRepository.save(existing);
      return this.mapCapital(saved);
    }

    if (existing && pendingCount === 0) {
      existing.initialCapital = formatted;
      existing.startingCapital = formatted;
      existing.currentCapital = formatted;
      const saved = await this.capitalRepository.save(existing);
      return this.mapCapital(saved);
    }

    const created = this.capitalRepository.create({
      initialCapital: formatted,
      startingCapital: formatted,
      currentCapital: formatted,
    });
    const saved = await this.capitalRepository.save(created);
    return this.mapCapital(saved);
  }

  async getCurrentCapitalValue() {
    const capital = await this.getCapitalEntity();
    if (!capital) {
      throw new BadRequestException(
        'Capitale non configurato. Imposta prima il capitale iniziale.',
      );
    }
    return parseMoney(capital.currentCapital);
  }

  async getInitialCapitalValue() {
    const capital = await this.getCapitalEntity();
    if (!capital) {
      throw new BadRequestException(
        'Capitale non configurato. Imposta prima il capitale iniziale.',
      );
    }
    return parseMoney(capital.initialCapital);
  }

  async getStartingCapitalValue() {
    const capital = await this.getCapitalEntity();
    if (!capital) {
      throw new BadRequestException(
        'Capitale non configurato. Imposta prima il capitale iniziale.',
      );
    }
    await this.ensureStartingCapital(capital);
    return parseMoney(capital.startingCapital ?? capital.initialCapital);
  }

  async updateCurrentCapital(value: string) {
    const capital = await this.getCapitalEntity();
    if (!capital) {
      throw new NotFoundException('Capitale non trovato');
    }
    capital.currentCapital = formatMoney(value);
    await this.capitalRepository.save(capital);
  }

  async updateInitialCapital(value: number) {
    const capital = await this.getCapitalEntity();
    if (!capital) {
      throw new NotFoundException('Capitale non trovato');
    }

    capital.initialCapital = formatMoney(value);
    const saved = await this.capitalRepository.save(capital);
    return this.mapCapital(saved);
  }

  private async getCapitalEntity() {
    const records = await this.capitalRepository.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return records[0] ?? null;
  }

  private async ensureStartingCapital(record: Capital) {
    if (record.startingCapital) {
      return;
    }

    const settledBets = await this.betRepository.find({
      where: [{ status: BetStatus.WON }, { status: BetStatus.LOST }],
    });

    if (settledBets.length) {
      const netDelta = settledBets.reduce((total, bet) => {
        if (!bet.capitalAfter) {
          return total;
        }
        return total.add(
          parseMoney(bet.capitalAfter).minus(parseMoney(bet.capitalBefore)),
        );
      }, parseMoney('0'));

      record.startingCapital = parseMoney(record.currentCapital)
        .minus(netDelta)
        .toFixed(2);
    } else {
      record.startingCapital = record.currentCapital;
    }

    await this.capitalRepository.save(record);
  }

  private mapCapital(record: Capital) {
    const startingCapital = record.startingCapital ?? record.initialCapital;

    return {
      id: record.id,
      initialCapital: formatMoney(record.initialCapital),
      startingCapital: formatMoney(startingCapital),
      currentCapital: formatMoney(record.currentCapital),
      createdAt: record.createdAt,
    };
  }
}
