import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ScalataStepStatus } from '../../common/enums/scalata-step-status.enum';
import { Bet } from '../../bets/entities/bet.entity';
import { ScalataRun } from './scalata-run.entity';

@Entity('scalata_steps')
export class ScalataStep {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'scalata_run_id', type: 'int' })
  scalataRunId: number;

  @ManyToOne(() => ScalataRun, (run) => run.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scalata_run_id' })
  scalataRun: ScalataRun;

  @Column({ type: 'int' })
  day: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'bankroll_before' })
  bankrollBefore: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  stake: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'planned_odds' })
  plannedOdds: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'bankroll_after' })
  bankrollAfter: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'step_profit' })
  stepProfit: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    name: 'cumulative_profit',
  })
  cumulativeProfit: string;

  @Column({ name: 'risk_level', type: 'varchar', length: 16 })
  riskLevel: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: ScalataStepStatus.PENDING,
  })
  status: ScalataStepStatus;

  @Column({ name: 'bet_id', type: 'int', nullable: true })
  betId: number | null;

  @ManyToOne(() => Bet, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bet_id' })
  bet: Bet | null;
}
