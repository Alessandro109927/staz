import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ScalataRunStatus } from '../../common/enums/scalata-run-status.enum';
import { ScalataStep } from './scalata-step.entity';

@Entity('scalata_runs')
export class ScalataRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({
    type: 'varchar',
    length: 16,
    default: ScalataRunStatus.ACTIVE,
  })
  status: ScalataRunStatus;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'start_bankroll' })
  startBankroll: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'target_profit' })
  targetProfit: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'target_capital' })
  targetCapital: string;

  @Column({ name: 'days_mode', type: 'varchar', length: 16 })
  daysMode: string;

  @Column({ name: 'odds_strategy', type: 'varchar', length: 16 })
  oddsStrategy: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'max_daily_odds' })
  maxDailyOdds: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'min_daily_odds' })
  minDailyOdds: string;

  @Column({ name: 'total_days', type: 'int' })
  totalDays: number;

  @Column({ name: 'current_day', type: 'int', default: 1 })
  currentDay: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'capital_settled', type: 'boolean', default: false })
  capitalSettled: boolean;

  @Column({
    name: 'capital_adjustment',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  capitalAdjustment: string | null;

  @OneToMany(() => ScalataStep, (step) => step.scalataRun, { cascade: true })
  steps: ScalataStep[];
}
