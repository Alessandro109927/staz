import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Bet,
  BetEventItem,
  BetStats,
  BetStatus,
  Capital,
  CreateScalataPayload,
  MonthOption,
  MonthlyReport,
  OddsRangeKpi,
  ScalataRun,
  ScalataRunStatus,
  StakePreview,
  StakingRule,
  TeamOption,
  OutcomeOption,
} from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getCapital(): Observable<Capital | null> {
    return this.http.get<Capital | null>(`${this.baseUrl}/capital`);
  }

  setCapital(initialCapital: number, reset = false): Observable<Capital> {
    return this.http.post<Capital>(`${this.baseUrl}/capital`, {
      initialCapital,
      reset,
    });
  }

  updateInitialCapital(initialCapital: number): Observable<Capital> {
    return this.http.patch<Capital>(`${this.baseUrl}/capital/initial`, {
      initialCapital,
    });
  }

  getStakingRules(): Observable<StakingRule[]> {
    return this.http.get<StakingRule[]>(`${this.baseUrl}/staking-rules`);
  }

  createStakingRule(rule: {
    minOdds: number;
    maxOdds?: number | null;
    stakePercentage: number;
  }): Observable<StakingRule> {
    return this.http.post<StakingRule>(`${this.baseUrl}/staking-rules`, rule);
  }

  updateStakingRule(
    id: number,
    rule: Partial<{
      minOdds: number;
      maxOdds: number | null;
      stakePercentage: number;
    }>,
  ): Observable<StakingRule> {
    return this.http.put<StakingRule>(`${this.baseUrl}/staking-rules/${id}`, rule);
  }

  deleteStakingRule(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.baseUrl}/staking-rules/${id}`);
  }

  calculateStake(events: BetEventItem[]): Observable<StakePreview> {
    return this.http.post<StakePreview>(`${this.baseUrl}/bets/calculate-stake`, {
      events,
    });
  }

  createBet(bet: {
    events: BetEventItem[];
    betDate: string;
    stakePercentageApplied?: number;
    amountStaked?: number;
    potentialWin?: number;
    status?: BetStatus;
  }): Observable<Bet> {
    return this.http.post<Bet>(`${this.baseUrl}/bets`, bet);
  }

  getBets(filters?: {
    status?: BetStatus;
    from?: string;
    to?: string;
  }): Observable<Bet[]> {
    let params = new HttpParams();
    if (filters?.status) {
      params = params.set('status', filters.status);
    }
    if (filters?.from) {
      params = params.set('from', filters.from);
    }
    if (filters?.to) {
      params = params.set('to', filters.to);
    }
    return this.http.get<Bet[]>(`${this.baseUrl}/bets`, { params });
  }

  updateBet(
    id: number,
    bet: {
      events: BetEventItem[];
      betDate: string;
      status: BetStatus;
      stakePercentageApplied?: number;
      amountStaked?: number;
      potentialWin?: number;
    },
  ): Observable<Bet> {
    return this.http.patch<Bet>(`${this.baseUrl}/bets/${id}`, bet);
  }

  settleBet(id: number, status: 'WON' | 'LOST'): Observable<Bet> {
    return this.http.patch<Bet>(`${this.baseUrl}/bets/${id}/settle`, { status });
  }

  deleteBet(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.baseUrl}/bets/${id}`);
  }

  updateEventResult(
    betId: number,
    eventId: number,
    result: 'WON' | 'LOST' | null,
  ): Observable<Bet> {
    return this.http.patch<Bet>(
      `${this.baseUrl}/bets/${betId}/events/${eventId}/result`,
      { result },
    );
  }

  getBetStats(): Observable<BetStats> {
    return this.http.get<BetStats>(`${this.baseUrl}/bets/stats`);
  }

  getOddsRangeStats(): Observable<OddsRangeKpi[]> {
    return this.http.get<OddsRangeKpi[]>(`${this.baseUrl}/bets/stats/odds-ranges`);
  }

  getAvailableMonths(): Observable<MonthOption[]> {
    return this.http.get<MonthOption[]>(`${this.baseUrl}/bets/stats/months`);
  }

  getMonthlyReport(year: number, month: number): Observable<MonthlyReport> {
    const params = new HttpParams().set('year', year).set('month', month);
    return this.http.get<MonthlyReport>(`${this.baseUrl}/bets/stats/monthly`, { params });
  }

  getScalataRuns(status?: ScalataRunStatus): Observable<ScalataRun[]> {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<ScalataRun[]>(`${this.baseUrl}/scalata`, { params });
  }

  getScalataRun(id: number): Observable<ScalataRun> {
    return this.http.get<ScalataRun>(`${this.baseUrl}/scalata/${id}`);
  }

  createScalataRun(payload: CreateScalataPayload): Observable<ScalataRun> {
    return this.http.post<ScalataRun>(`${this.baseUrl}/scalata`, payload);
  }

  submitScalataStep(
    runId: number,
    stepId: number,
    payload: {
      events: BetEventItem[];
      betDate: string;
      status: BetStatus;
    },
  ): Observable<ScalataRun> {
    return this.http.post<ScalataRun>(
      `${this.baseUrl}/scalata/${runId}/steps/${stepId}`,
      payload,
    );
  }

  abandonScalataRun(id: number): Observable<ScalataRun> {
    return this.http.patch<ScalataRun>(`${this.baseUrl}/scalata/${id}/abandon`, {});
  }

  cashOutScalataRun(id: number): Observable<ScalataRun> {
    return this.http.patch<ScalataRun>(`${this.baseUrl}/scalata/${id}/cash-out`, {});
  }

  deleteScalataRun(id: number): Observable<{ deleted: boolean; id: number }> {
    return this.http.delete<{ deleted: boolean; id: number }>(
      `${this.baseUrl}/scalata/${id}`,
    );
  }

  searchTeams(query: string, limit = 12): Observable<TeamOption[]> {
    const params = new HttpParams().set('q', query).set('limit', String(limit));
    return this.http.get<TeamOption[]>(`${this.baseUrl}/teams/search`, { params });
  }

  getOutcomeOptions(): Observable<OutcomeOption[]> {
    return this.http.get<OutcomeOption[]>(`${this.baseUrl}/outcome-options`);
  }

  createOutcomeOption(payload: {
    label: string;
    description?: string | null;
    sortOrder?: number;
    kind?: OutcomeOption['kind'];
  }): Observable<OutcomeOption> {
    return this.http.post<OutcomeOption>(`${this.baseUrl}/outcome-options`, payload);
  }

  updateOutcomeOption(
    id: number,
    payload: Partial<{
      label: string;
      description: string | null;
      sortOrder: number;
      kind: OutcomeOption['kind'];
    }>,
  ): Observable<OutcomeOption> {
    return this.http.put<OutcomeOption>(`${this.baseUrl}/outcome-options/${id}`, payload);
  }

  deleteOutcomeOption(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.baseUrl}/outcome-options/${id}`);
  }
}
