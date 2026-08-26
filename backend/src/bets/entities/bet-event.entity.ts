import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Bet } from './bet.entity';

@Entity('bet_events')
export class BetEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'bet_id' })
  betId: number;

  @ManyToOne(() => Bet, (bet) => bet.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bet_id' })
  bet: Bet;

  @Column({ name: 'event_name', type: 'varchar', length: 255 })
  eventName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  outcome: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  odds: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
