import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { StakingRule } from './entities/staking-rule.entity';
import { StakingRulesController } from './staking-rules.controller';
import { StakingRulesService } from './staking-rules.service';

@Module({
  imports: [TypeOrmModule.forFeature([StakingRule]), forwardRef(() => AuthModule)],
  controllers: [StakingRulesController],
  providers: [StakingRulesService],
  exports: [StakingRulesService],
})
export class StakingRulesModule {}
