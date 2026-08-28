import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BetStatus } from '../../common/enums/bet-status.enum';
import { BetEvent } from './bet-event.entity';

@Entity('bets')
export class Bet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ name: 'event_name', type: 'varchar', length: 1000 })
  eventName: string;

  @OneToMany(() => BetEvent, (event) => event.bet, { cascade: true })
  events: BetEvent[];

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  odds: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    name: 'stake_percentage_applied',
  })
  stakePercentageApplied: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'amount_staked' })
  amountStaked: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    name: 'potential_win',
    nullable: true,
  })
  potentialWin: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'capital_before' })
  capitalBefore: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    name: 'capital_after',
    nullable: true,
  })
  capitalAfter: string | null;

  @Column({ type: 'enum', enum: BetStatus, default: BetStatus.PENDING })
  status: BetStatus;

  @Column({ name: 'bet_date', type: 'timestamp' })
  betDate: Date;

  @Column({ name: 'settled_at', type: 'timestamp', nullable: true })
  settledAt: Date | null;
}
