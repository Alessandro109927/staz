import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StakingRule } from './entities/staking-rule.entity';
import { StakingRulesController } from './staking-rules.controller';
import { StakingRulesService } from './staking-rules.service';

@Module({
  imports: [TypeOrmModule.forFeature([StakingRule])],
  controllers: [StakingRulesController],
  providers: [StakingRulesService],
  exports: [StakingRulesService],
})
export class StakingRulesModule {}
