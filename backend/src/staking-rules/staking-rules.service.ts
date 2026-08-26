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

@Injectable()
export class StakingRulesService {
  constructor(
    @InjectRepository(StakingRule)
    private readonly stakingRuleRepository: Repository<StakingRule>,
  ) {}

  findAll() {
    return this.stakingRuleRepository.find({
      order: { minOdds: 'ASC' },
    });
  }

  async create(dto: CreateStakingRuleDto) {
    const rule = this.stakingRuleRepository.create({
      minOdds: formatMoney(dto.minOdds),
      maxOdds: dto.maxOdds != null ? formatMoney(dto.maxOdds) : null,
      stakePercentage: formatMoney(dto.stakePercentage),
    });
    return this.stakingRuleRepository.save(rule);
  }

  async update(id: number, dto: UpdateStakingRuleDto) {
    const rule = await this.findOne(id);

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

  async findOne(id: number) {
    const rule = await this.stakingRuleRepository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException(`Regola ${id} non trovata`);
    }
    return rule;
  }

  async remove(id: number) {
    const rule = await this.findOne(id);
    await this.stakingRuleRepository.remove(rule);
    return { deleted: true };
  }

  async resolveStakePercentage(odds: number | string | Decimal) {
    const oddsValue = toDecimal(odds);
    const rules = await this.findAll();

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

  async calculateStake(odds: number, capitalBase: Decimal) {
    const stakePercentage = await this.resolveStakePercentage(odds);
    const amount = capitalBase.mul(stakePercentage).div(100);

    return {
      stakePercentage: stakePercentage.toFixed(2),
      amountStaked: amount.toFixed(2),
      initialCapital: capitalBase.toFixed(2),
    };
  }
}
