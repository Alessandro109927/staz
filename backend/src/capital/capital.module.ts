import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bet } from '../bets/entities/bet.entity';
import { CapitalController } from './capital.controller';
import { CapitalService } from './capital.service';
import { Capital } from './entities/capital.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Capital, Bet])],
  controllers: [CapitalController],
  providers: [CapitalService],
  exports: [CapitalService],
})
export class CapitalModule {}
