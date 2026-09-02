import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Bet } from '../bets/entities/bet.entity';
import { BetsModule } from '../bets/bets.module';
import { CapitalModule } from '../capital/capital.module';
import { ScalataRun } from './entities/scalata-run.entity';
import { ScalataStep } from './entities/scalata-step.entity';
import { ScalataController } from './scalata.controller';
import { ScalataService } from './scalata.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScalataRun, ScalataStep, Bet]),
    AuthModule,
    BetsModule,
    CapitalModule,
  ],
  controllers: [ScalataController],
  providers: [ScalataService],
})
export class ScalataModule {}
