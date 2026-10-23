import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BetsModule } from '../bets/bets.module';
import { Bet } from '../bets/entities/bet.entity';
import { CapitalController } from './capital.controller';
import { CapitalService } from './capital.service';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Capital } from './entities/capital.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Capital, Bet]),
    AuthModule,
    OrganizationsModule,
    forwardRef(() => BetsModule),
  ],
  controllers: [CapitalController],
  providers: [CapitalService],
  exports: [CapitalService],
})
export class CapitalModule {}
