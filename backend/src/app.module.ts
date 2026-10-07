import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { BetsModule } from './bets/bets.module';
import { CapitalModule } from './capital/capital.module';
import { DatabaseModule } from './database/database.module';
import { ScalataModule } from './scalata/scalata.module';
import { StakingRulesModule } from './staking-rules/staking-rules.module';
import { TeamsModule } from './teams/teams.module';
import { OutcomeOptionsModule } from './outcome-options/outcome-options.module';
import { MultigolScoutModule } from './multigol-scout/multigol-scout.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'staz'),
        password: config.get<string>('DB_PASSWORD', 'staz'),
        database: config.get<string>('DB_DATABASE', 'staz'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    AuthModule,
    CapitalModule,
    StakingRulesModule,
    BetsModule,
    ScalataModule,
    TeamsModule,
    OutcomeOptionsModule,
    MultigolScoutModule,
    DatabaseModule,
  ],
})
export class AppModule {}
