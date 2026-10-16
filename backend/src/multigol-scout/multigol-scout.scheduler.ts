import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { MultigolScoutService } from './multigol-scout.service';

@Injectable()
export class MultigolScoutScheduler {
  private readonly logger = new Logger(MultigolScoutScheduler.name);

  constructor(
    private readonly scout: MultigolScoutService,
    private readonly config: ConfigService,
  ) {}

  /** Notte (Europe/Rome): calcola sempre le partite del giorno successivo. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Europe/Rome' })
  async nightlyIncremental(): Promise<void> {
    if (!this.cronEnabled()) {
      return;
    }
    this.logger.log('Avvio calcolo notturno Scout Multigol (giorno successivo)…');
    try {
      await this.scout.runNightlyRefresh();
      this.logger.log('Calcolo notturno Scout completato.');
    } catch (err) {
      this.logger.warn(`Calcolo notturno Scout fallito: ${String(err)}`);
    }
  }

  private cronEnabled(): boolean {
    const raw = this.config
      .get<string>('MULTIGOL_SCOUT_NIGHTLY_CRON', 'true')
      ?.trim()
      .toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'no';
  }
}
