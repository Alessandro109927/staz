import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Bet } from '../bets/entities/bet.entity';
import { Capital } from '../capital/entities/capital.entity';
import { StakingRule } from '../staking-rules/entities/staking-rule.entity';
import { LegacyDataMigrationService } from './legacy-data-migration.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Capital, Bet, StakingRule])],
  providers: [LegacyDataMigrationService],
})
export class DatabaseModule {}
