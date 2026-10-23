import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetfairPaperService } from './betfair-paper.service';

@Injectable()
export class BetfairPaperScheduler implements OnModuleInit {
  private readonly logger = new Logger(BetfairPaperScheduler.name);

  constructor(
    private readonly config: ConfigService,
    private readonly paper: BetfairPaperService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.log('Lettura Betwatch spenta in locale. Parte solo sul server.');
      return;
    }
    if (this.config.get<string>('BETWATCH_POLL', '1') === '0') {
      this.logger.log('Lettura Betwatch spenta da BETWATCH_POLL=0.');
      return;
    }
    const seconds = Number(this.config.get<string>('BETWATCH_POLL_SECONDS', '60'));
    const intervalMs = Math.max(30, Number.isFinite(seconds) ? seconds : 60) * 1000;
    this.logger.log(`Lettura Betwatch ogni ${intervalMs / 1000}s.`);
    setTimeout(() => void this.paper.tick(), 8_000);
    setInterval(() => void this.paper.tick(), intervalMs);
  }
}
