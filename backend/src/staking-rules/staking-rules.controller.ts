import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import {
  CreateStakingRuleDto,
  UpdateStakingRuleDto,
} from './dto/staking-rule.dto';
import { StakingRulesService } from './staking-rules.service';

@Controller('staking-rules')
@UseGuards(JwtAuthGuard)
export class StakingRulesController {
  constructor(private readonly stakingRulesService: StakingRulesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.stakingRulesService.findAll(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStakingRuleDto) {
    return this.stakingRulesService.create(user.userId, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStakingRuleDto,
  ) {
    return this.stakingRulesService.update(user.userId, Number(id), dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stakingRulesService.remove(user.userId, Number(id));
  }
}
