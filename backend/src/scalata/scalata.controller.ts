import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import {
  CreateScalataDto,
  ListScalataQueryDto,
  SubmitScalataStepDto,
} from './dto/scalata.dto';
import { ScalataService } from './scalata.service';

@Controller('scalata')
@UseGuards(JwtAuthGuard)
export class ScalataController {
  constructor(private readonly scalataService: ScalataService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateScalataDto) {
    return this.scalataService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListScalataQueryDto) {
    return this.scalataService.findAll(user.userId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scalataService.findOne(user.userId, Number(id));
  }

  @Post(':id/steps/:stepId')
  submitStep(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: SubmitScalataStepDto,
  ) {
    return this.scalataService.submitStep(
      user.userId,
      Number(id),
      Number(stepId),
      dto,
    );
  }

  @Patch(':id/abandon')
  abandon(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scalataService.abandon(user.userId, Number(id));
  }

  @Patch(':id/cash-out')
  cashOut(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scalataService.cashOut(user.userId, Number(id));
  }
}
