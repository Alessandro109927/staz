import {
  Body,
  Controller,
  Delete,
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
import { BetsService } from './bets.service';
import {
  CalculateStakeDto,
  CreateBetDto,
  ListBetsQueryDto,
  SettleBetDto,
  UpdateBetDto,
} from './dto/bet.dto';
import { UpdateEventResultDto } from './dto/update-event-result.dto';
import { MonthlyReportQueryDto } from './dto/monthly-report.dto';

@Controller('bets')
@UseGuards(JwtAuthGuard)
export class BetsController {
  constructor(private readonly betsService: BetsService) {}

  @Post('calculate-stake')
  calculateStake(@CurrentUser() user: AuthUser, @Body() dto: CalculateStakeDto) {
    return this.betsService.calculateStake(user.userId, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBetDto) {
    return this.betsService.create(user.userId, dto);
  }

  @Get('stats/months')
  getAvailableMonths(@CurrentUser() user: AuthUser) {
    return this.betsService.getAvailableMonths(user.userId);
  }

  @Get('stats/monthly')
  getMonthlyReport(
    @CurrentUser() user: AuthUser,
    @Query() query: MonthlyReportQueryDto,
  ) {
    return this.betsService.getMonthlyReport(user.userId, query.year, query.month);
  }

  @Get('stats/odds-ranges')
  getOddsRangeStats(@CurrentUser() user: AuthUser) {
    return this.betsService.getOddsRangeStats(user.userId);
  }

  @Get('stats')
  getStats(@CurrentUser() user: AuthUser) {
    return this.betsService.getStats(user.userId);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListBetsQueryDto) {
    return this.betsService.findAll(user.userId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.betsService.findOne(user.userId, Number(id));
  }

  @Patch(':betId/events/:eventId/result')
  updateEventResult(
    @CurrentUser() user: AuthUser,
    @Param('betId') betId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventResultDto,
  ) {
    return this.betsService.updateEventResult(
      user.userId,
      Number(betId),
      Number(eventId),
      dto,
    );
  }

  @Patch(':id/settle')
  settle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SettleBetDto,
  ) {
    return this.betsService.settle(user.userId, Number(id), dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBetDto,
  ) {
    return this.betsService.update(user.userId, Number(id), dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.betsService.remove(user.userId, Number(id));
  }
}
