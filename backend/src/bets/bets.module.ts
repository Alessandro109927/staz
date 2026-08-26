import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapitalModule } from '../capital/capital.module';
import { StakingRulesModule } from '../staking-rules/staking-rules.module';
import { BetsController } from './bets.controller';
import { BetsService } from './bets.service';
import { BetEvent } from './entities/bet-event.entity';
import { Bet } from './entities/bet.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bet, BetEvent]),
    CapitalModule,
    StakingRulesModule,
  ],
  controllers: [BetsController],
  providers: [BetsService],
  exports: [BetsService],
})
export class BetsModule {}
