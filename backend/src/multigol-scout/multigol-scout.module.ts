import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ApiFootballClient } from './api-football.client';
import { MultigolScoutCalibrationEntity } from './entities/multigol-scout-calibration.entity';
import { MultigolScoutOpportunityEntity } from './entities/multigol-scout-opportunity.entity';
import { MultigolScoutPickResultEntity } from './entities/multigol-scout-pick-result.entity';
import { MultigolScoutStateEntity } from './entities/multigol-scout-state.entity';
import { MultigolScoutCalibrationService } from './multigol-scout-calibration.service';
import { MultigolNarrativeService } from './multigol-narrative.service';
import { MultigolScoutController } from './multigol-scout.controller';
import { MultigolScoutScheduler } from './multigol-scout.scheduler';
import { MultigolScoutStoreService } from './multigol-scout-store.service';
import { MultigolScoutService } from './multigol-scout.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      MultigolScoutOpportunityEntity,
      MultigolScoutStateEntity,
      MultigolScoutPickResultEntity,
      MultigolScoutCalibrationEntity,
    ]),
  ],
  controllers: [MultigolScoutController],
  providers: [
    ApiFootballClient,
    MultigolScoutService,
    MultigolScoutStoreService,
    MultigolScoutCalibrationService,
    MultigolScoutScheduler,
    MultigolNarrativeService,
  ],
})
export class MultigolScoutModule {}
