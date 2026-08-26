import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StakingRule } from '../staking-rules/entities/staking-rule.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([StakingRule])],
  providers: [SeedService],
})
export class DatabaseModule {}
