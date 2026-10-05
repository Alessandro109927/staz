import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FootballDataClient } from './football-data.client';
import { MultigolNarrativeService } from './multigol-narrative.service';
import { MultigolScoutController } from './multigol-scout.controller';
import { MultigolScoutService } from './multigol-scout.service';

@Module({
  imports: [AuthModule],
  controllers: [MultigolScoutController],
  providers: [FootballDataClient, MultigolScoutService, MultigolNarrativeService],
})
export class MultigolScoutModule {}
