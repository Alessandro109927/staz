import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BetsService } from '../bets/bets.service';
import { Bet } from '../bets/entities/bet.entity';
import { BetStatus } from '../common/enums/bet-status.enum';
import { Capital } from './entities/capital.entity';
import { SetCapitalDto } from './dto/set-capital.dto';
import {
  formatMoney,
  moneyDifference,
  parseMoney,
} from '../common/decimal.util';

@Injectable()
export class CapitalService {
  constructor(
    @InjectRepository(Capital)
    private readonly capitalRepository: Repository<Capital>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @Inject(forwardRef(() => BetsService))
    private readonly betsService: BetsService,
  ) {}

  async getCapital(userId: number) {
    const record = await this.getCapitalEntity(userId);
    if (!record) {
      return null;
    }

    await this.ensureStartingCapital(record);
    await this.betsService.recalculateCapitalChain(userId);

    const refreshed = await this.getCapitalEntity(userId);
    if (!refreshed) {
      return null;
    }

    return this.mapCapital(refreshed);
  }

  async setCapital(userId: number, dto: SetCapitalDto) {
    const pendingCount = await this.betRepository.count({
      where: { userId, status: BetStatus.PENDING, isScalata: false },
    });
    const settledCount = await this.betRepository.count({
      where: [
        { userId, status: BetStatus.WON, isScalata: false },
        { userId, status: BetStatus.LOST, isScalata: false },
      ],
    });
    const existing = await this.getCapitalEntity(userId);

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
      await this.capitalRepository.save(existing);
      await this.betsService.recalculateCapitalChain(userId);
      return this.getCapital(userId);
    }

    if (existing && settledCount > 0) {
      existing.initialCapital = formatted;
      await this.capitalRepository.save(existing);
      await this.betsService.recalculateCapitalChain(userId);
      return this.getCapital(userId);
    }

    if (existing && pendingCount === 0) {
      existing.initialCapital = formatted;
      existing.startingCapital = formatted;
      existing.currentCapital = formatted;
      const saved = await this.capitalRepository.save(existing);
      return this.mapCapital(saved);
    }

    const created = this.capitalRepository.create({
      userId,
      initialCapital: formatted,
      startingCapital: formatted,
      currentCapital: formatted,
    });
    const saved = await this.capitalRepository.save(created);
    return this.mapCapital(saved);
  }

  async getCurrentCapitalValue(userId: number) {
    const capital = await this.getCapitalEntity(userId);
    if (!capital) {
      throw new BadRequestException(
        'Capitale non configurato. Imposta prima il capitale iniziale.',
      );
    }
    return parseMoney(capital.currentCapital);
  }

  async getInitialCapitalValue(userId: number) {
    const capital = await this.getCapitalEntity(userId);
    if (!capital) {
      throw new BadRequestException(
        'Capitale non configurato. Imposta prima il capitale iniziale.',
      );
    }
    return parseMoney(capital.initialCapital);
  }

  async getStartingCapitalValue(userId: number) {
    const capital = await this.getCapitalEntity(userId);
    if (!capital) {
      throw new BadRequestException(
        'Capitale non configurato. Imposta prima il capitale iniziale.',
      );
    }
    await this.ensureStartingCapital(capital);
    return parseMoney(capital.startingCapital ?? capital.initialCapital);
  }

  async updateCurrentCapital(userId: number, value: string) {
    const capital = await this.getCapitalEntity(userId);
    if (!capital) {
      throw new NotFoundException('Capitale non trovato');
    }
    capital.currentCapital = formatMoney(value);
    await this.capitalRepository.save(capital);
  }

  async updateInitialCapital(userId: number, value: number) {
    const capital = await this.getCapitalEntity(userId);
    if (!capital) {
      throw new NotFoundException('Capitale non trovato');
    }

    capital.initialCapital = formatMoney(value);
    const saved = await this.capitalRepository.save(capital);
    return this.mapCapital(saved);
  }

  private async getCapitalEntity(userId: number) {
    return this.capitalRepository.findOne({ where: { userId } });
  }

  private async ensureStartingCapital(record: Capital) {
    if (record.startingCapital) {
      return;
    }

    const settledBets = await this.betRepository.find({
      where: [
        { userId: record.userId ?? undefined, status: BetStatus.WON, isScalata: false },
        { userId: record.userId ?? undefined, status: BetStatus.LOST, isScalata: false },
      ],
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

      record.startingCapital = formatMoney(
        parseMoney(record.currentCapital).minus(netDelta),
      );
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
      profit: moneyDifference(record.currentCapital, startingCapital),
      createdAt: record.createdAt,
    };
  }
}
