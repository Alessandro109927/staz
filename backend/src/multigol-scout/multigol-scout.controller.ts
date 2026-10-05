import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MultigolScoutService } from './multigol-scout.service';

@Controller('multigol-scout')
@UseGuards(JwtAuthGuard)
export class MultigolScoutController {
  constructor(private readonly scout: MultigolScoutService) {}

  @Get('competitions')
  competitions() {
    return this.scout.getCompetitions();
  }

  @Get('opportunities')
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.scout.listOpportunities(from, to);
  }

  @Get('leagues/:code/opportunities')
  listLeague(
    @Param('code') code: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const key = /^\d+$/.test(code.trim()) ? code.trim() : code.toUpperCase();
    return this.scout.listLeagueOpportunities(key, from, to);
  }

  @Get('matches/:id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.scout.analyzeMatch(id);
  }
}
