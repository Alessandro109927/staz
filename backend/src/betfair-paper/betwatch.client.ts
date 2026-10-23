import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type BetwatchLiveInfo = {
  time: number | null;
  is_ht: boolean;
  goal_v1: number;
  goal_v2: number;
  finished: boolean;
};

export type BetwatchRunner = {
  runner_id: number | string;
  name: string;
  volume: number | string | null;
  odd: number | string | null;
};

export type BetwatchMarket = {
  market_id: number | string;
  name: string;
  status?: string;
  runners: BetwatchRunner[];
};

export type BetwatchMatch = {
  match_id: number | string;
  teams: { v1: string; v2: string };
  league?: string;
  markets: BetwatchMarket[];
  live_info?: BetwatchLiveInfo;
};

@Injectable()
export class BetwatchClient {
  private readonly logger = new Logger(BetwatchClient.name);
  private readonly hosts = [
    'https://api.betwatch.fr/api/v1',
    'https://betwatch.fr/api/v1',
  ];

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.token().length > 0;
  }

  live(): Promise<BetwatchMatch[]> {
    return this.getJson<BetwatchMatch[]>('/football/live');
  }

  async event(matchId: string): Promise<BetwatchMatch | null> {
    try {
      return await this.getJson<BetwatchMatch>(`/football/event/${matchId}`);
    } catch (error) {
      if (error instanceof BetwatchRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private token(): string {
    return this.config.get<string>('BETWATCH_API_KEY', '').trim();
  }

  private async getJson<T>(path: string): Promise<T> {
    const token = this.token();
    if (!token) {
      throw new BetwatchRequestError('Chiave Betwatch assente', 0);
    }

    let lastError: unknown;
    for (const host of this.hosts) {
      try {
        const response = await fetch(`${host}${path}`, {
          headers: {
            Authorization: `Token ${token}`,
            Accept: 'application/json',
            'User-Agent': 'Staz/1.0',
          },
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status === 403 || response.status >= 500) {
          lastError = new BetwatchRequestError(
            `Betwatch ${response.status} su ${path}`,
            response.status,
          );
          continue;
        }
        if (!response.ok) {
          throw new BetwatchRequestError(
            `Betwatch ${response.status} su ${path}`,
            response.status,
          );
        }
        return (await response.json()) as T;
      } catch (error) {
        if (
          error instanceof BetwatchRequestError &&
          error.status !== 403 &&
          error.status < 500
        ) {
          throw error;
        }
        lastError = error;
      }
    }

    this.logger.warn(
      lastError instanceof Error ? lastError.message : 'Lettura Betwatch fallita',
    );
    throw lastError instanceof Error
      ? lastError
      : new BetwatchRequestError('Lettura Betwatch fallita', 0);
  }
}

export class BetwatchRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
