import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import {
  CreateStakingRuleDto,
  UpdateStakingRuleDto,
} from './dto/staking-rule.dto';
import { StakingRulesService } from './staking-rules.service';

@Controller('staking-rules')
export class StakingRulesController {
  constructor(private readonly stakingRulesService: StakingRulesService) {}

  @Get()
  findAll() {
    return this.stakingRulesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateStakingRuleDto) {
    return this.stakingRulesService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStakingRuleDto) {
    return this.stakingRulesService.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.stakingRulesService.remove(Number(id));
  }
}
