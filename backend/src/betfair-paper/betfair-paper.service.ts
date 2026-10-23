import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BetStatus } from '../common/enums/bet-status.enum';
import { formatMoney } from '../common/decimal.util';
import { BetEvent } from '../bets/entities/bet-event.entity';
import { Bet } from '../bets/entities/bet.entity';
import { BetsService } from '../bets/bets.service';
import { Capital } from '../capital/entities/capital.entity';
import { ORG_BETFAIR } from '../organizations/organization.constants';
import {
  currentOrganization,
  runWithOrganization,
} from '../organizations/organization-context';
import { OrganizationsService } from '../organizations/organizations.service';
import { BetwatchClient, BetwatchMatch } from './betwatch.client';
import { BetfairPaperPick } from './entities/betfair-paper-pick.entity';
import {
  PAPER_MAX_PICKS_PER_MATCH,
  PAPER_MIN_ODD,
  PAPER_MIN_VOLUME,
  PAPER_WEIGHT_PERCENT,
  PaperRunner,
  rankMatchCandidates,
  settleSelection,
} from './betfair-paper.rules';

export type BetfairPaperStatus = {
  active: boolean;
  hasCapital: boolean;
  thresholdPercent: number;
  minVolume: number;
  minOdd: number;
  maxPicksPerMatch: number;
  lastRunAt: string | null;
  matchesSeen: number;
  requestsUsed: number;
  lastError: string | null;
  openPicks: number;
  placedPicks: number;
};

@Injectable()
export class BetfairPaperService {
  private readonly logger = new Logger(BetfairPaperService.name);
  private running = false;
  private lastRunAt: string | null = null;
  private matchesSeen = 0;
  private requestsUsed = 0;
  private lastError: string | null = null;

  constructor(
    private readonly betwatch: BetwatchClient,
    private readonly organizations: OrganizationsService,
    private readonly bets: BetsService,
    @InjectRepository(BetfairPaperPick)
    private readonly picks: Repository<BetfairPaperPick>,
    @InjectRepository(Capital)
    private readonly capitals: Repository<Capital>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(BetEvent)
    private readonly betEvents: Repository<BetEvent>,
  ) {}

  async tick(): Promise<void> {
    if (this.running || !this.betwatch.isConfigured()) {
      return;
    }
    this.running = true;
    try {
      await this.run();
      this.lastRunAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Lettura Betwatch fallita';
      this.logger.warn(this.lastError);
    } finally {
      this.running = false;
    }
  }

  async statusForCurrentUser(userId: number): Promise<BetfairPaperStatus> {
    const active = currentOrganization().slug === ORG_BETFAIR;
    const betfairId = this.organizations.getBySlug(ORG_BETFAIR).id;
    const capital = active
      ? await this.capitals.findOne({
          where: { userId, organizationId: betfairId },
        })
      : null;
    const [openPicks, placedPicks] = active
      ? await Promise.all([
          this.picks.count({ where: { userId, settled: false } }),
          this.picks.count({ where: { userId } }),
        ])
      : [0, 0];

    return {
      active,
      hasCapital: capital != null,
      thresholdPercent: PAPER_WEIGHT_PERCENT,
      minVolume: PAPER_MIN_VOLUME,
      minOdd: PAPER_MIN_ODD,
      maxPicksPerMatch: PAPER_MAX_PICKS_PER_MATCH,
      lastRunAt: this.lastRunAt,
      matchesSeen: this.matchesSeen,
      requestsUsed: this.requestsUsed,
      lastError: this.lastError,
      openPicks,
      placedPicks,
    };
  }

  private async run(): Promise<void> {
    const matches = await this.betwatch.live();
    this.requestsUsed += 1;
    const list = Array.isArray(matches) ? matches : [];
    this.matchesSeen = list.length;

    const betfair = this.organizations.getBySlug(ORG_BETFAIR);
    const capitals = await this.capitals.find({
      where: { organizationId: betfair.id },
    });

    for (const capital of capitals) {
      if (capital.userId == null) {
        continue;
      }
      await runWithOrganization({ id: betfair.id, slug: ORG_BETFAIR }, () =>
        this.runForUser(capital.userId as number, list),
      );
    }
  }

  private async runForUser(userId: number, matches: BetwatchMatch[]): Promise<void> {
    const liveById = new Map(matches.map((match) => [String(match.match_id), match]));
    await this.rememberHalfTime(userId, matches);
    await this.placeSignals(userId, matches);
    await this.settleOpenPicks(userId, liveById);
  }

  private async rememberHalfTime(userId: number, matches: BetwatchMatch[]): Promise<void> {
    for (const match of matches) {
      if (!match.live_info?.is_ht) {
        continue;
      }
      await this.picks.update(
        { userId, matchId: String(match.match_id), settled: false },
        {
          htHome: match.live_info.goal_v1,
          htAway: match.live_info.goal_v2,
        },
      );
    }
  }

  private async placeSignals(userId: number, matches: BetwatchMatch[]): Promise<void> {
    for (const match of matches) {
      if (match.live_info?.finished) {
        continue;
      }
      const existing = await this.picks.find({
        where: { userId, matchId: String(match.match_id) },
      });
      const slots = PAPER_MAX_PICKS_PER_MATCH - existing.length;
      if (slots <= 0) {
        continue;
      }
      const taken = new Set(existing.map((pick) => `${pick.marketId}:${pick.runnerId}`));
      const chosen = rankMatchCandidates(runnersOf(match))
        .filter((candidate) => !taken.has(`${candidate.marketId}:${candidate.runnerId}`))
        .slice(0, slots);

      for (const candidate of chosen) {
        try {
          await this.placePick(userId, match, candidate);
        } catch (error) {
          this.logger.warn(
            error instanceof Error ? error.message : 'Scommessa finta non registrata',
          );
        }
      }
    }
  }

  private async placePick(
    userId: number,
    match: BetwatchMatch,
    candidate: ReturnType<typeof rankMatchCandidates>[number],
  ): Promise<void> {
    const home = match.teams.v1;
    const away = match.teams.v2;
    const bet = await this.bets.create(userId, {
      events: [
        {
          eventName: clip(`${home} - ${away}`, 250),
          outcome: clip(
            `${candidate.marketName} — ${candidate.runnerName} · ${Math.round(candidate.weight)}%`,
            250,
          ),
          odds: Number(candidate.odd!.toFixed(2)),
        },
      ],
      betDate: new Date().toISOString(),
    });

    await this.picks.save(
      this.picks.create({
        userId,
        matchId: String(match.match_id),
        marketId: candidate.marketId,
        runnerId: candidate.runnerId,
        marketName: candidate.marketName,
        runnerName: candidate.runnerName,
        homeTeam: home,
        awayTeam: away,
        weight: formatMoney(candidate.weight),
        volume: formatMoney(candidate.volume),
        matchVolume: formatMoney(candidate.matchVolume),
        odd: formatMoney(candidate.odd!),
        betId: bet.id,
        htHome: match.live_info?.is_ht ? match.live_info.goal_v1 : null,
        htAway: match.live_info?.is_ht ? match.live_info.goal_v2 : null,
        settled: false,
      }),
    );
    this.logger.log(
      `Scommessa finta ${home} - ${away}: ${candidate.runnerName} ${candidate.weight}%`,
    );
  }

  private async settleOpenPicks(
    userId: number,
    liveById: Map<string, BetwatchMatch>,
  ): Promise<void> {
    const open = await this.picks.find({ where: { userId, settled: false } });
    const missing = new Set<string>();

    for (const pick of open) {
      const live = liveById.get(pick.matchId);
      if (live?.live_info?.is_ht) {
        pick.htHome = live.live_info.goal_v1;
        pick.htAway = live.live_info.goal_v2;
      }
      if (live?.live_info?.finished) {
        await this.settlePick(userId, pick, live);
        continue;
      }
      if (!live) {
        missing.add(pick.matchId);
      }
    }

    for (const matchId of missing) {
      const event = await this.betwatch.event(matchId);
      this.requestsUsed += 1;
      if (!event?.live_info?.finished) {
        continue;
      }
      const related = open.filter((pick) => pick.matchId === matchId && !pick.settled);
      for (const pick of related) {
        await this.settlePick(userId, pick, event);
      }
    }
  }

  private async settlePick(
    userId: number,
    pick: BetfairPaperPick,
    match: BetwatchMatch,
  ): Promise<void> {
    const info = match.live_info;
    if (!info) {
      return;
    }
    const result = settleSelection({
      marketName: pick.marketName,
      runnerName: pick.runnerName,
      homeTeam: pick.homeTeam,
      awayTeam: pick.awayTeam,
      fullTime: { home: info.goal_v1, away: info.goal_v2 },
      halfTime:
        pick.htHome != null && pick.htAway != null
          ? { home: pick.htHome, away: pick.htAway }
          : null,
    });
    if (result === 'PENDING') {
      await this.picks.save(pick);
      return;
    }

    if (result === 'PUSH') {
      const bet = await this.betRepository.findOne({ where: { id: pick.betId, userId } });
      if (bet && bet.status === BetStatus.PENDING) {
        bet.odds = formatMoney(1);
        bet.potentialWin = bet.amountStaked;
        await this.betRepository.save(bet);
        await this.bets.settle(userId, bet.id, { status: BetStatus.WON });
      }
    } else {
      const bet = await this.betRepository.findOne({ where: { id: pick.betId, userId } });
      if (bet && bet.status === BetStatus.PENDING) {
        await this.betEvents.update(
          { betId: bet.id },
          { resultStatus: result === 'WON' ? BetStatus.WON : BetStatus.LOST },
        );
        await this.bets.settle(userId, bet.id, {
          status: result === 'WON' ? BetStatus.WON : BetStatus.LOST,
        });
      }
    }

    pick.settled = true;
    await this.picks.save(pick);
  }
}

function runnersOf(match: BetwatchMatch): PaperRunner[] {
  const runners: PaperRunner[] = [];
  for (const market of match.markets ?? []) {
    for (const runner of market.runners ?? []) {
      const volume = asNumber(runner.volume);
      runners.push({
        marketId: String(market.market_id),
        marketName: market.name,
        marketStatus: market.status ?? 'OPEN',
        runnerId: String(runner.runner_id),
        runnerName: runner.name,
        volume: volume ?? 0,
        odd: asNumber(runner.odd),
      });
    }
  }
  return runners;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
