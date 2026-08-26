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
  MonthOption,
  MonthlyReport,
  OddsRangeKpi,
  StakePreview,
  StakingRule,
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
}
