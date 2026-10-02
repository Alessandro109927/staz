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
  CreateOutcomeOptionDto,
  UpdateOutcomeOptionDto,
} from './dto/outcome-option.dto';
import { OutcomeOptionsService } from './outcome-options.service';

@Controller('outcome-options')
@UseGuards(JwtAuthGuard)
export class OutcomeOptionsController {
  constructor(private readonly outcomeOptionsService: OutcomeOptionsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.outcomeOptionsService.findAll(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOutcomeOptionDto) {
    return this.outcomeOptionsService.create(user.userId, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOutcomeOptionDto,
  ) {
    return this.outcomeOptionsService.update(user.userId, Number(id), dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.outcomeOptionsService.remove(user.userId, Number(id));
  }
}
