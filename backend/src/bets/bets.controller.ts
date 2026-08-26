import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BetsService } from './bets.service';
import {
  CalculateStakeDto,
  CreateBetDto,
  ListBetsQueryDto,
  SettleBetDto,
  UpdateBetDto,
} from './dto/bet.dto';
import { MonthlyReportQueryDto } from './dto/monthly-report.dto';

@Controller('bets')
export class BetsController {
  constructor(private readonly betsService: BetsService) {}

  @Post('calculate-stake')
  calculateStake(@Body() dto: CalculateStakeDto) {
    return this.betsService.calculateStake(dto);
  }

  @Post()
  create(@Body() dto: CreateBetDto) {
    return this.betsService.create(dto);
  }

  @Get('stats/months')
  getAvailableMonths() {
    return this.betsService.getAvailableMonths();
  }

  @Get('stats/monthly')
  getMonthlyReport(@Query() query: MonthlyReportQueryDto) {
    return this.betsService.getMonthlyReport(query.year, query.month);
  }

  @Get('stats/odds-ranges')
  getOddsRangeStats() {
    return this.betsService.getOddsRangeStats();
  }

  @Get('stats')
  getStats() {
    return this.betsService.getStats();
  }

  @Get()
  findAll(@Query() query: ListBetsQueryDto) {
    return this.betsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.betsService.findOne(Number(id));
  }

  @Patch(':id/settle')
  settle(@Param('id') id: string, @Body() dto: SettleBetDto) {
    return this.betsService.settle(Number(id), dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBetDto) {
    return this.betsService.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.betsService.remove(Number(id));
  }
}
