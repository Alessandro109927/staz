import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Bet } from '../bets/entities/bet.entity';
import { BetsService } from '../bets/bets.service';
import { BetStatus } from '../common/enums/bet-status.enum';
import { ScalataRunStatus } from '../common/enums/scalata-run-status.enum';
import { ScalataStepStatus } from '../common/enums/scalata-step-status.enum';
import { formatMoney, parseMoney } from '../common/decimal.util';
import { CapitalService } from '../capital/capital.service';
import { normalizeEvents } from '../bets/bet.helpers';
import {
  CreateScalataDto,
  ListScalataQueryDto,
  SubmitScalataStepDto,
} from './dto/scalata.dto';
import { ScalataRun } from './entities/scalata-run.entity';
import { ScalataStep } from './entities/scalata-step.entity';
import { buildScalataPlan } from './scalata.helpers';

@Injectable()
export class ScalataService {
  constructor(
    @InjectRepository(ScalataRun)
    private readonly runRepository: Repository<ScalataRun>,
    @InjectRepository(ScalataStep)
    private readonly stepRepository: Repository<ScalataStep>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    private readonly betsService: BetsService,
    private readonly capitalService: CapitalService,
  ) {}

  async create(userId: number, dto: CreateScalataDto) {
    const plan = buildScalataPlan(dto);
    if (!plan.feasible) {
      throw new BadRequestException(
        plan.message ?? 'Piano scalata non fattibile',
      );
    }

    const run = this.runRepository.create({
      userId,
      status: ScalataRunStatus.ACTIVE,
      startBankroll: formatMoney(plan.startBankroll),
      targetProfit: formatMoney(plan.targetProfit),
      targetCapital: formatMoney(plan.targetCapital),
      daysMode: dto.daysMode,
      oddsStrategy: dto.oddsStrategy,
      maxDailyOdds: formatMoney(dto.maxDailyOdds),
      minDailyOdds: formatMoney(dto.minDailyOdds),
      totalDays: plan.totalDays,
      currentDay: 1,
      completedAt: null,
      steps: plan.steps.map((step) =>
        this.stepRepository.create({
          day: step.day,
          bankrollBefore: formatMoney(step.bankrollBefore),
          stake: formatMoney(step.stake),
          plannedOdds: formatMoney(step.odds),
          bankrollAfter: formatMoney(step.bankrollAfter),
          stepProfit: formatMoney(step.stepProfit),
          cumulativeProfit: formatMoney(step.cumulativeProfit),
          riskLevel: step.riskLevel,
          status: ScalataStepStatus.PENDING,
          betId: null,
        }),
      ),
    });

    const saved = await this.runRepository.save(run);
    return this.findOne(userId, saved.id);
  }

  async findAll(userId: number, query: ListScalataQueryDto) {
    const where: FindOptionsWhere<ScalataRun> = { userId };
    if (query.status) {
      where.status = query.status;
    }

    const runs = await this.runRepository.find({
      where,
      relations: { steps: true },
      order: { createdAt: 'DESC' },
    });

    return runs.map((run) => this.mapRun(run));
  }

  async findOne(userId: number, id: number) {
    const run = await this.findRunWithSteps(userId, id);
    if (!run) {
      throw new NotFoundException(`Scalata ${id} non trovata`);
    }
    return this.mapRun(run);
  }

  async submitStep(
    userId: number,
    runId: number,
    stepId: number,
    dto: SubmitScalataStepDto,
  ) {
    const run = await this.findRunWithSteps(userId, runId);
    if (!run) {
      throw new NotFoundException(`Scalata ${runId} non trovata`);
    }

    if (run.status !== ScalataRunStatus.ACTIVE) {
      throw new BadRequestException('Questa scalata non è più attiva');
    }

    const step = run.steps.find((item) => item.id === stepId);
    if (!step) {
      throw new NotFoundException(`Step ${stepId} non trovato`);
    }

    if (step.day !== run.currentDay) {
      throw new BadRequestException(
        `Puoi giocare solo la bet ${run.currentDay} della scalata`,
      );
    }

    const normalized = normalizeEvents(dto.events);
    const stake = step.stake;
    const potentialWin = parseMoney(stake)
      .mul(normalized.combinedOdds)
      .toFixed(2);
    const initialCapital =
      await this.capitalService.getInitialCapitalValue(userId);
    const stakePercentage = parseMoney(stake)
      .div(initialCapital)
      .mul(100)
      .toFixed(2);

    let betId = step.betId;

    if (betId) {
      await this.betsService.update(userId, betId, {
        events: dto.events,
        betDate: dto.betDate,
        status: dto.status,
        amountStaked: Number(stake),
        stakePercentageApplied: Number(stakePercentage),
        potentialWin: Number(potentialWin),
        isScalata: true,
      });
    } else {
      const bet = await this.betsService.create(userId, {
        events: dto.events,
        betDate: dto.betDate,
        status: dto.status,
        amountStaked: Number(stake),
        stakePercentageApplied: Number(stakePercentage),
        potentialWin: Number(potentialWin),
        isScalata: true,
      });
      betId = bet.id;
    }

    const nextStatus = this.mapBetStatusToStepStatus(dto.status);
    step.betId = betId;
    step.status = nextStatus;
    await this.stepRepository.save(step);

    await this.advanceRunAfterStep(run, step, dto.status);

    return this.findOne(userId, runId);
  }

  async abandon(userId: number, id: number) {
    const run = await this.findRunWithSteps(userId, id);
    if (!run) {
      throw new NotFoundException(`Scalata ${id} non trovata`);
    }

    if (run.status !== ScalataRunStatus.ACTIVE) {
      throw new BadRequestException('Questa scalata non è attiva');
    }

    run.status = ScalataRunStatus.ABANDONED;
    run.completedAt = new Date();
    await this.runRepository.save(run);

    return this.mapRun(run);
  }

  async cashOut(userId: number, id: number) {
    const run = await this.findRunWithSteps(userId, id);
    if (!run) {
      throw new NotFoundException(`Scalata ${id} non trovata`);
    }

    if (run.status !== ScalataRunStatus.ACTIVE) {
      throw new BadRequestException('Questa scalata non è attiva');
    }

    const wonSteps = run.steps.filter(
      (step) => step.status === ScalataStepStatus.WON,
    );
    if (!wonSteps.length) {
      throw new BadRequestException(
        'Devi aver vinto almeno una bet prima di staccare',
      );
    }

    run.status = ScalataRunStatus.COMPLETED;
    run.completedAt = new Date();
    await this.runRepository.save(run);

    return this.findOne(userId, id);
  }

  async remove(userId: number, id: number) {
    const run = await this.findRunWithSteps(userId, id);
    if (!run) {
      throw new NotFoundException(`Scalata ${id} non trovata`);
    }

    const betIds = run.steps
      .map((step) => step.betId)
      .filter((betId): betId is number => betId != null);

    await this.runRepository.remove(run);

    if (betIds.length) {
      await this.betRepository.delete({
        userId,
        id: In(betIds),
        isScalata: true,
      });
    }

    await this.betsService.recalculateCapitalChain(userId);

    return { deleted: true, id };
  }

  private async advanceRunAfterStep(
    run: ScalataRun,
    step: ScalataStep,
    betStatus: BetStatus,
  ) {
    if (betStatus === BetStatus.LOST) {
      run.status = ScalataRunStatus.FAILED;
      run.completedAt = new Date();
      await this.runRepository.save(run);
      return;
    }

    if (betStatus === BetStatus.PENDING) {
      return;
    }

    if (betStatus === BetStatus.WON) {
      const targetProfit = parseMoney(run.targetProfit);
      const cumulativeProfit = parseMoney(step.cumulativeProfit);
      const isLastDay = step.day >= run.totalDays;
      const targetReached = cumulativeProfit.gte(targetProfit.sub(0.01));

      if (isLastDay || targetReached) {
        run.status = ScalataRunStatus.COMPLETED;
        run.completedAt = new Date();
      } else {
        run.currentDay = step.day + 1;
      }

      await this.runRepository.save(run);
    }
  }

  private mapBetStatusToStepStatus(status: BetStatus): ScalataStepStatus {
    switch (status) {
      case BetStatus.WON:
        return ScalataStepStatus.WON;
      case BetStatus.LOST:
        return ScalataStepStatus.LOST;
      default:
        return ScalataStepStatus.PENDING;
    }
  }

  private async findRunWithSteps(userId: number, id: number) {
    const run = await this.runRepository.findOne({
      where: { id, userId },
      relations: { steps: { bet: { events: true } } },
    });

    if (run?.steps) {
      run.steps.sort((a, b) => a.day - b.day);
      await this.repairStepBetLinks(userId, run);
      const linkedBetIds = run.steps
        .map((step) => step.betId)
        .filter((id): id is number => id != null);
      const markedCount = await this.betsService.markAsScalata(
        userId,
        linkedBetIds,
      );
      if (markedCount > 0) {
        await this.betsService.recalculateCapitalChain(userId);
      }
    }

    return run;
  }

  private async repairStepBetLinks(userId: number, run: ScalataRun) {
    const stepsNeedingBet = run.steps.filter(
      (step) => !step.bet?.events?.length,
    );
    if (!stepsNeedingBet.length) {
      return;
    }

    const linkedBetIds = await this.getLinkedBetIdsForUser(userId);
    const runStartedAt = run.createdAt;

    for (const step of [...run.steps].sort((a, b) => a.day - b.day)) {
      if (step.bet?.events?.length) {
        if (step.betId) {
          linkedBetIds.add(step.betId);
        }
        continue;
      }

      if (step.betId) {
        const bet = await this.loadBetWithEvents(userId, step.betId);
        if (bet?.events?.length) {
          step.bet = bet;
          linkedBetIds.add(bet.id);
          continue;
        }
      }

      const betStatus = this.mapStepStatusToBetStatus(step.status);
      if (!betStatus) {
        continue;
      }

      const match =
        (await this.findRepairBet(
          userId,
          step,
          betStatus,
          linkedBetIds,
          runStartedAt,
          true,
        )) ??
        (await this.findRepairBet(
          userId,
          step,
          betStatus,
          linkedBetIds,
          runStartedAt,
          false,
        ));

      if (!match) {
        continue;
      }

      step.bet = match;
      step.betId = match.id;
      linkedBetIds.add(match.id);
      await this.stepRepository.update({ id: step.id }, { betId: match.id });
    }
  }

  private async loadBetWithEvents(userId: number, betId: number) {
    return this.betRepository.findOne({
      where: { id: betId, userId },
      relations: { events: true },
    });
  }

  private async findRepairBet(
    userId: number,
    step: ScalataStep,
    betStatus: BetStatus,
    linkedBetIds: Set<number>,
    runStartedAt: Date,
    strictTiming: boolean,
  ): Promise<Bet | null> {
    const query = this.betRepository
      .createQueryBuilder('bet')
      .leftJoinAndSelect('bet.events', 'events')
      .where('bet.user_id = :userId', { userId })
      .andWhere('bet.amount_staked = :stake', { stake: step.stake })
      .andWhere('bet.status = :status', { status: betStatus })
      .orderBy('bet.id', 'ASC');

    if (strictTiming) {
      if (betStatus === BetStatus.PENDING) {
        const runDayStart = new Date(runStartedAt);
        runDayStart.setHours(0, 0, 0, 0);
        query.andWhere('bet.bet_date >= :runDayStart', { runDayStart });
      } else {
        query.andWhere('bet.settled_at >= :runStartedAt', { runStartedAt });
      }
    }

    const candidates = await query.getMany();
    return (
      candidates.find(
        (bet) => !linkedBetIds.has(bet.id) && (bet.events?.length ?? 0) > 0,
      ) ?? null
    );
  }

  private async getLinkedBetIdsForUser(userId: number): Promise<Set<number>> {
    const rows = await this.stepRepository
      .createQueryBuilder('step')
      .innerJoin('step.scalataRun', 'run')
      .where('run.user_id = :userId', { userId })
      .andWhere('step.bet_id IS NOT NULL')
      .select('step.bet_id', 'betId')
      .getRawMany<{ betId: string | number }>();

    return new Set(rows.map((row) => Number(row.betId)));
  }

  private mapStepStatusToBetStatus(
    status: ScalataStepStatus,
  ): BetStatus | null {
    switch (status) {
      case ScalataStepStatus.WON:
        return BetStatus.WON;
      case ScalataStepStatus.LOST:
        return BetStatus.LOST;
      case ScalataStepStatus.PENDING:
        return BetStatus.PENDING;
      default:
        return null;
    }
  }

  private mapRun(run: ScalataRun) {
    const steps = [...(run.steps ?? [])].sort((a, b) => a.day - b.day);
    const completedSteps = steps.filter(
      (step) => step.status === ScalataStepStatus.WON,
    ).length;

    return {
      id: run.id,
      status: run.status,
      startBankroll: run.startBankroll,
      targetProfit: run.targetProfit,
      targetCapital: run.targetCapital,
      daysMode: run.daysMode,
      oddsStrategy: run.oddsStrategy,
      maxDailyOdds: run.maxDailyOdds,
      minDailyOdds: run.minDailyOdds,
      totalDays: run.totalDays,
      currentDay: run.currentDay,
      completedSteps,
      progressPercent:
        run.totalDays > 0
          ? Math.round((completedSteps / run.totalDays) * 100)
          : 0,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      steps: steps.map((step) => this.mapStep(step, run.currentDay)),
    };
  }

  private mapStep(step: ScalataStep, currentDay: number) {
    const bet = step.bet;
    return {
      id: step.id,
      day: step.day,
      bankrollBefore: step.bankrollBefore,
      stake: step.stake,
      plannedOdds: step.plannedOdds,
      bankrollAfter: step.bankrollAfter,
      stepProfit: step.stepProfit,
      cumulativeProfit: step.cumulativeProfit,
      riskLevel: step.riskLevel,
      status: step.status,
      betId: step.betId,
      isCurrent: step.day === currentDay,
      isLocked: step.day > currentDay,
      bet: bet
        ? {
            id: bet.id,
            eventName: bet.eventName,
            odds: bet.odds,
            amountStaked: bet.amountStaked,
            potentialWin: bet.potentialWin,
            status: bet.status,
            betDate:
              bet.betDate instanceof Date
                ? bet.betDate.toISOString()
                : new Date(bet.betDate).toISOString(),
            events: (bet.events ?? [])
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((event) => ({
                id: event.id,
                eventName: event.eventName,
                outcome: event.outcome,
                odds: event.odds,
                sortOrder: event.sortOrder,
                resultStatus: event.resultStatus,
              })),
          }
        : null,
    };
  }
}
