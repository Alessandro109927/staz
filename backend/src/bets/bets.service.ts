import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { CapitalService } from '../capital/capital.service';
import { BetStatus } from '../common/enums/bet-status.enum';
import { formatMoney, parseMoney } from '../common/decimal.util';
import { StakingRulesService } from '../staking-rules/staking-rules.service';
import { normalizeEvents } from './bet.helpers';
import { deriveBetStatusFromEvents } from './event-result.helpers';
import {
  accumulateBetStats,
  buildMonthlyReport,
  createOddsRangeAccumulators,
  formatOddsRangeStats,
  listBetMonths,
} from './bet-stats.helpers';
import {
  CalculateStakeDto,
  CreateBetDto,
  ListBetsQueryDto,
  SettleBetDto,
  UpdateBetDto,
} from './dto/bet.dto';
import { UpdateEventResultDto } from './dto/update-event-result.dto';
import { BetEvent } from './entities/bet-event.entity';
import { Bet } from './entities/bet.entity';

@Injectable()
export class BetsService {
  constructor(
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(BetEvent)
    private readonly betEventRepository: Repository<BetEvent>,
    private readonly capitalService: CapitalService,
    private readonly stakingRulesService: StakingRulesService,
  ) {}

  async calculateStake(userId: number, dto: CalculateStakeDto) {
    const { combinedOdds } = normalizeEvents(dto.events);
    const initialCapital = await this.capitalService.getInitialCapitalValue(userId);
    const calculation = await this.stakingRulesService.calculateStake(
      userId,
      combinedOdds,
      initialCapital,
    );

    return {
      ...calculation,
      combinedOdds: formatMoney(combinedOdds),
      events: dto.events.map((event) => ({
        eventName: event.eventName,
        outcome: event.outcome,
        odds: formatMoney(event.odds),
      })),
    };
  }

  async create(userId: number, dto: CreateBetDto) {
    const normalized = normalizeEvents(dto.events);
    const initialCapital = await this.capitalService.getInitialCapitalValue(userId);
    const currentCapital = await this.capitalService.getCurrentCapitalValue(userId);
    const calculation = await this.stakingRulesService.calculateStake(
      userId,
      normalized.combinedOdds,
      initialCapital,
    );

    let stakePercentage = calculation.stakePercentage;
    let amountStaked = calculation.amountStaked;

    if (dto.amountStaked != null) {
      amountStaked = formatMoney(dto.amountStaked);
      stakePercentage = parseMoney(amountStaked)
        .div(initialCapital)
        .mul(100)
        .toFixed(2);
    } else if (dto.stakePercentageApplied != null) {
      stakePercentage = formatMoney(dto.stakePercentageApplied);
      amountStaked = initialCapital
        .mul(parseMoney(stakePercentage))
        .div(100)
        .toFixed(2);
    }

    const bet = this.betRepository.create({
      userId,
      eventName: normalized.eventSummary,
      odds: formatMoney(normalized.combinedOdds),
      stakePercentageApplied: stakePercentage,
      amountStaked,
      potentialWin: this.resolvePotentialWin(
        dto.potentialWin,
        amountStaked,
        formatMoney(normalized.combinedOdds),
      ),
      capitalBefore: formatMoney(currentCapital),
      capitalAfter: null,
      status: BetStatus.PENDING,
      betDate: new Date(dto.betDate),
      settledAt: null,
      events: normalized.formattedEvents.map((event) =>
        this.betEventRepository.create({
          eventName: event.eventName,
          outcome: event.outcome,
          odds: event.odds,
          sortOrder: event.sortOrder,
          resultStatus: event.resultStatus,
        }),
      ),
    });

    const saved = await this.betRepository.save(bet);
    const withEvents = await this.findBetWithEvents(userId, saved.id);
    return this.mapBet(withEvents!);
  }

  async updateEventResult(
    userId: number,
    betId: number,
    eventId: number,
    dto: UpdateEventResultDto,
  ) {
    const bet = await this.findBetWithEvents(userId, betId);
    if (!bet) {
      throw new NotFoundException(`Scommessa ${betId} non trovata`);
    }

    const event = bet.events.find((item) => item.id === eventId);
    if (!event) {
      throw new NotFoundException(`Evento ${eventId} non trovato`);
    }

    event.resultStatus = dto.result ?? null;
    await this.betEventRepository.save(event);

    const previousStatus = bet.status;
    const nextStatus = deriveBetStatusFromEvents(bet.events);
    bet.status = nextStatus;

    if (nextStatus === BetStatus.PENDING) {
      bet.settledAt = null;
    } else if (previousStatus === BetStatus.PENDING || nextStatus !== previousStatus) {
      bet.settledAt = new Date();
    }

    await this.betRepository.save(bet);
    await this.recalculateCapitalChain(userId);

    const withEvents = await this.findBetWithEvents(userId, betId);
    return this.mapBet(withEvents!);
  }

  async findAll(userId: number, query: ListBetsQueryDto) {
    const where: FindOptionsWhere<Bet> = { userId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.from && query.to) {
      where.betDate = Between(new Date(query.from), new Date(query.to));
    }

    const bets = await this.betRepository.find({
      where,
      relations: { events: true },
      order: {
        betDate: 'DESC',
        id: 'DESC',
        events: { sortOrder: 'ASC' },
      },
    });

    return bets.map((bet) => this.mapBet(bet));
  }

  async findOne(userId: number, id: number) {
    const bet = await this.findBetWithEvents(userId, id);
    if (!bet) {
      throw new NotFoundException(`Scommessa ${id} non trovata`);
    }
    return this.mapBet(bet);
  }

  async settle(userId: number, id: number, dto: SettleBetDto) {
    const bet = await this.findBetWithEvents(userId, id);
    if (!bet) {
      throw new NotFoundException(`Scommessa ${id} non trovata`);
    }

    if (bet.status === dto.status) {
      throw new BadRequestException('La scommessa ha già questo esito');
    }

    bet.status = dto.status;
    bet.settledAt = new Date();

    await this.betRepository.save(bet);
    await this.recalculateCapitalChain(userId);

    const withEvents = await this.findBetWithEvents(userId, id);
    return this.mapBet(withEvents!);
  }

  async update(userId: number, id: number, dto: UpdateBetDto) {
    const bet = await this.findBetWithEvents(userId, id);
    if (!bet) {
      throw new NotFoundException(`Scommessa ${id} non trovata`);
    }

    const normalized = normalizeEvents(dto.events);
    const initialCapital = await this.capitalService.getInitialCapitalValue(userId);
    const previousStatus = bet.status;

    let stakePercentage = formatMoney(
      dto.stakePercentageApplied ?? bet.stakePercentageApplied,
    );
    let amountStaked = formatMoney(dto.amountStaked ?? bet.amountStaked);

    if (dto.amountStaked != null) {
      amountStaked = formatMoney(dto.amountStaked);
      stakePercentage = parseMoney(amountStaked)
        .div(initialCapital)
        .mul(100)
        .toFixed(2);
    } else if (dto.stakePercentageApplied != null) {
      stakePercentage = formatMoney(dto.stakePercentageApplied);
      amountStaked = initialCapital
        .mul(parseMoney(stakePercentage))
        .div(100)
        .toFixed(2);
    }

    bet.eventName = normalized.eventSummary;
    bet.odds = formatMoney(normalized.combinedOdds);
    bet.stakePercentageApplied = stakePercentage;
    bet.amountStaked = amountStaked;
    bet.potentialWin = this.resolvePotentialWin(
      dto.potentialWin,
      amountStaked,
      formatMoney(normalized.combinedOdds),
      bet.potentialWin,
    );
    bet.betDate = new Date(dto.betDate);
    bet.status = dto.status;

    if (dto.status === BetStatus.PENDING) {
      bet.settledAt = null;
    } else if (previousStatus === BetStatus.PENDING || dto.status !== previousStatus) {
      bet.settledAt = new Date();
    }

    await this.betEventRepository.delete({ betId: id });
    const previousResults = new Map(
      bet.events.map((event) => [event.sortOrder, event.resultStatus]),
    );

    bet.events = normalized.formattedEvents.map((event) =>
      this.betEventRepository.create({
        eventName: event.eventName,
        outcome: event.outcome,
        odds: event.odds,
        sortOrder: event.sortOrder,
        resultStatus:
          event.resultStatus ?? previousResults.get(event.sortOrder) ?? null,
      }),
    );

    await this.betRepository.save(bet);
    await this.recalculateCapitalChain(userId);

    const withEvents = await this.findBetWithEvents(userId, id);
    return this.mapBet(withEvents!);
  }

  async remove(userId: number, id: number) {
    const bet = await this.betRepository.findOne({ where: { id, userId } });
    if (!bet) {
      throw new NotFoundException(`Scommessa ${id} non trovata`);
    }

    await this.betRepository.remove(bet);
    await this.recalculateCapitalChain(userId);
    return { deleted: true };
  }

  async getStats(userId: number) {
    const [won, lost, pending] = await Promise.all([
      this.betRepository.count({ where: { userId, status: BetStatus.WON } }),
      this.betRepository.count({ where: { userId, status: BetStatus.LOST } }),
      this.betRepository.count({ where: { userId, status: BetStatus.PENDING } }),
    ]);

    return { won, lost, pending, total: won + lost + pending };
  }

  async getOddsRangeStats(userId: number) {
    const bets = await this.betRepository.find({
      where: { userId },
      relations: { events: true },
      order: { betDate: 'DESC', id: 'DESC' },
    });

    const accumulators = createOddsRangeAccumulators();
    for (const bet of bets) {
      accumulateBetStats(accumulators, bet);
    }

    return formatOddsRangeStats(accumulators);
  }

  async getAvailableMonths(userId: number) {
    const bets = await this.betRepository.find({
      where: { userId },
      select: { betDate: true },
      order: { betDate: 'DESC' },
    });

    return listBetMonths(bets);
  }

  async getMonthlyReport(userId: number, year: number, month: number) {
    const bets = await this.betRepository.find({
      where: { userId },
      relations: { events: true },
      order: { betDate: 'DESC', id: 'DESC' },
    });

    return buildMonthlyReport(bets, year, month);
  }

  private async recalculateCapitalChain(userId: number): Promise<void> {
    let running = await this.capitalService.getStartingCapitalValue(userId);

    const bets = await this.betRepository.find({
      where: { userId },
      order: { betDate: 'ASC', id: 'ASC' },
    });

    for (const bet of bets) {
      bet.capitalBefore = running.toFixed(2);
      const stake = parseMoney(bet.amountStaked);
      const odds = parseMoney(bet.odds);

      if (bet.status === BetStatus.PENDING) {
        bet.capitalAfter = null;
        continue;
      }

      if (bet.status === BetStatus.WON) {
        running = running.add(stake.mul(odds.minus(1)));
      } else if (bet.status === BetStatus.LOST) {
        running = running.minus(stake);
      }

      bet.capitalAfter = running.toFixed(2);
    }

    if (bets.length) {
      await this.betRepository.save(bets);
    }

    await this.capitalService.updateCurrentCapital(userId, running.toFixed(2));
  }

  private async findBetWithEvents(userId: number, id: number) {
    return this.betRepository.findOne({
      where: { id, userId },
      relations: { events: true },
      order: { events: { sortOrder: 'ASC' } },
    });
  }

  private mapBet(bet: Bet) {
    const capitalDelta =
      bet.capitalAfter != null
        ? parseMoney(bet.capitalAfter).minus(parseMoney(bet.capitalBefore)).toFixed(2)
        : null;

    const events =
      bet.events?.map((event) => ({
        id: event.id,
        eventName: event.eventName,
        outcome: event.outcome,
        odds: formatMoney(event.odds),
        sortOrder: event.sortOrder,
        resultStatus: event.resultStatus,
      })) ?? [];

    return {
      id: bet.id,
      eventName: bet.eventName,
      events,
      odds: formatMoney(bet.odds),
      stakePercentageApplied: formatMoney(bet.stakePercentageApplied),
      amountStaked: formatMoney(bet.amountStaked),
      potentialWin: this.formatPotentialWin(bet),
      capitalBefore: formatMoney(bet.capitalBefore),
      capitalAfter: bet.capitalAfter ? formatMoney(bet.capitalAfter) : null,
      capitalDelta,
      status: bet.status,
      betDate: bet.betDate,
      settledAt: bet.settledAt,
    };
  }

  private resolvePotentialWin(
    value: number | undefined,
    amountStaked: string,
    odds: string,
    existing: string | null = null,
  ): string {
    if (value != null) {
      return formatMoney(value);
    }

    if (existing != null) {
      return formatMoney(existing);
    }

    return parseMoney(amountStaked).mul(parseMoney(odds)).toFixed(2);
  }

  private formatPotentialWin(bet: Bet): string {
    if (bet.potentialWin != null) {
      return formatMoney(bet.potentialWin);
    }

    return parseMoney(bet.amountStaked).mul(parseMoney(bet.odds)).toFixed(2);
  }
}
