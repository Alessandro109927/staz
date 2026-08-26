import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StakingRule } from '../staking-rules/entities/staking-rule.entity';

const DEFAULT_RULES: Array<{
  minOdds: string;
  maxOdds: string | null;
  stakePercentage: string;
}> = [
  { minOdds: '1.00', maxOdds: '2.00', stakePercentage: '10.00' },
  { minOdds: '2.01', maxOdds: '3.00', stakePercentage: '7.00' },
  { minOdds: '3.01', maxOdds: '5.00', stakePercentage: '5.00' },
  { minOdds: '5.01', maxOdds: '10.00', stakePercentage: '3.00' },
  { minOdds: '10.01', maxOdds: null, stakePercentage: '1.00' },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(StakingRule)
    private readonly stakingRuleRepository: Repository<StakingRule>,
  ) {}

  async onModuleInit() {
    const count = await this.stakingRuleRepository.count();
    if (count > 0) {
      return;
    }

    await this.stakingRuleRepository.save(
      DEFAULT_RULES.map((rule) => this.stakingRuleRepository.create(rule)),
    );
    this.logger.log('Regole di staking di default inserite');
  }
}
