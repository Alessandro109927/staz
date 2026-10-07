import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MultigolScoutService } from './multigol-scout.service';

@Controller('multigol-scout')
@UseGuards(JwtAuthGuard)
export class MultigolScoutController {
  constructor(private readonly scout: MultigolScoutService) {}

  @Get('snapshot')
  snapshot() {
    return this.scout.getSnapshot();
  }

  @Post('snapshot/refresh')
  refreshSnapshot(
    @Query('mode') mode?: string,
    @Query('async') asyncFlag?: string,
  ) {
    const incremental = mode === 'incremental';
    const background =
      asyncFlag === '1' ||
      asyncFlag === 'true' ||
      asyncFlag?.toLowerCase() === 'yes';
    if (incremental) {
      if (background) {
        void this.scout.runIncrementalSnapshotRefresh();
        return { started: true, mode: 'incremental' };
      }
      return this.scout.runIncrementalSnapshotRefresh().then(() => ({
        started: false,
        mode: 'incremental',
      }));
    }
    if (background) {
      this.scout.refreshFullSnapshotBackground();
      return { started: true, mode: 'full' };
    }
    return this.scout.refreshFullSnapshot().then((meta) => ({
      started: false,
      mode: 'full',
      meta,
    }));
  }

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
  detail(
    @Param('id', ParseIntPipe) id: number,
    @Query('refresh') refresh?: string,
  ) {
    const force =
      refresh === '1' ||
      refresh === 'true' ||
      refresh?.toLowerCase() === 'yes';
    return this.scout.analyzeMatch(id, { refresh: force });
  }

  @Get('api-football/usage')
  apiFootballUsage() {
    return this.scout.getApiFootballUsage();
  }

  @Put('pick-results/:matchId')
  setPickResult(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() body: { result: 'WON' | 'LOST' | null },
  ) {
    const result =
      body?.result === 'WON' || body?.result === 'LOST' ? body.result : null;
    return this.scout.setPickResult(matchId, result);
  }

  @Post('pick-results/import')
  importPickResults(
    @Body()
    body: {
      items?: Array<{ matchId: number; result: 'WON' | 'LOST' }>;
    },
  ) {
    const items = Array.isArray(body?.items) ? body.items : [];
    return this.scout.importPickResults(items);
  }
}
