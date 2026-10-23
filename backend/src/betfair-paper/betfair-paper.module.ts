import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BetEvent } from '../bets/entities/bet-event.entity';
import { Bet } from '../bets/entities/bet.entity';
import { BetsModule } from '../bets/bets.module';
import { Capital } from '../capital/entities/capital.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { BetfairPaperController } from './betfair-paper.controller';
import { BetfairPaperScheduler } from './betfair-paper.scheduler';
import { BetfairPaperService } from './betfair-paper.service';
import { BetwatchClient } from './betwatch.client';
import { BetfairPaperPick } from './entities/betfair-paper-pick.entity';
import { TelegramNotifier } from './telegram.notifier';

@Module({
  imports: [
    TypeOrmModule.forFeature([BetfairPaperPick, Capital, Bet, BetEvent]),
    OrganizationsModule,
    AuthModule,
    BetsModule,
  ],
  controllers: [BetfairPaperController],
  providers: [BetwatchClient, BetfairPaperService, BetfairPaperScheduler, TelegramNotifier],
})
export class BetfairPaperModule {}
