import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  CreateStakingRuleDto,
  UpdateStakingRuleDto,
} from './dto/staking-rule.dto';
import { StakingRule } from './entities/staking-rule.entity';
import { formatMoney, parseMoney, toDecimal } from '../common/decimal.util';

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
export class StakingRulesService {
  constructor(
    @InjectRepository(StakingRule)
    private readonly stakingRuleRepository: Repository<StakingRule>,
  ) {}

  findAll(userId: number) {
    return this.stakingRuleRepository.find({
      where: { userId },
      order: { minOdds: 'ASC' },
    });
  }

  async seedDefaults(userId: number) {
    const count = await this.stakingRuleRepository.count({ where: { userId } });
    if (count > 0) {
      return;
    }

    await this.stakingRuleRepository.save(
      DEFAULT_RULES.map((rule) =>
        this.stakingRuleRepository.create({ userId, ...rule }),
      ),
    );
  }

  async create(userId: number, dto: CreateStakingRuleDto) {
    const rule = this.stakingRuleRepository.create({
      userId,
      minOdds: formatMoney(dto.minOdds),
      maxOdds: dto.maxOdds != null ? formatMoney(dto.maxOdds) : null,
      stakePercentage: formatMoney(dto.stakePercentage),
    });
    return this.stakingRuleRepository.save(rule);
  }

  async update(userId: number, id: number, dto: UpdateStakingRuleDto) {
    const rule = await this.findOne(userId, id);

    if (dto.minOdds !== undefined) {
      rule.minOdds = formatMoney(dto.minOdds);
    }
    if (dto.maxOdds !== undefined) {
      rule.maxOdds = dto.maxOdds != null ? formatMoney(dto.maxOdds) : null;
    }
    if (dto.stakePercentage !== undefined) {
      rule.stakePercentage = formatMoney(dto.stakePercentage);
    }

    return this.stakingRuleRepository.save(rule);
  }

  async findOne(userId: number, id: number) {
    const rule = await this.stakingRuleRepository.findOne({
      where: { id, userId },
    });
    if (!rule) {
      throw new NotFoundException(`Regola ${id} non trovata`);
    }
    return rule;
  }

  async remove(userId: number, id: number) {
    const rule = await this.findOne(userId, id);
    await this.stakingRuleRepository.remove(rule);
    return { deleted: true };
  }

  async resolveStakePercentage(
    userId: number,
    odds: number | string | Decimal,
  ) {
    const oddsValue = toDecimal(odds);
    const rules = await this.findAll(userId);

    if (!rules.length) {
      throw new BadRequestException('Nessuna regola di stake configurata');
    }

    for (const rule of rules) {
      const min = parseMoney(rule.minOdds);
      const max = rule.maxOdds ? parseMoney(rule.maxOdds) : null;

      const aboveMin = oddsValue.gte(min);
      const belowMax = max ? oddsValue.lte(max) : true;

      if (aboveMin && belowMax) {
        return parseMoney(rule.stakePercentage);
      }
    }

    throw new BadRequestException(
      `Nessuna regola di stake trovata per la quota ${oddsValue.toFixed(2)}`,
    );
  }

  async calculateStake(userId: number, odds: number, capitalBase: Decimal) {
    const stakePercentage = await this.resolveStakePercentage(userId, odds);
    const amount = capitalBase.mul(stakePercentage).div(100);

    return {
      stakePercentage: stakePercentage.toFixed(2),
      amountStaked: amount.toFixed(2),
      initialCapital: capitalBase.toFixed(2),
    };
  }
}
