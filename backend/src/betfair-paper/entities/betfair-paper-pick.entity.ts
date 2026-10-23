import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('betfair_paper_picks')
@Unique(['userId', 'matchId', 'marketId', 'runnerId'])
export class BetfairPaperPick {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'match_id', type: 'varchar', length: 32 })
  matchId: string;

  @Column({ name: 'market_id', type: 'varchar', length: 32 })
  marketId: string;

  @Column({ name: 'runner_id', type: 'varchar', length: 32 })
  runnerId: string;

  @Column({ name: 'market_name', type: 'varchar', length: 160 })
  marketName: string;

  @Column({ name: 'runner_name', type: 'varchar', length: 160 })
  runnerName: string;

  @Column({ name: 'home_team', type: 'varchar', length: 160 })
  homeTeam: string;

  @Column({ name: 'away_team', type: 'varchar', length: 160 })
  awayTeam: string;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  weight: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  volume: string;

  @Column({ name: 'match_volume', type: 'decimal', precision: 14, scale: 2 })
  matchVolume: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  odd: string;

  @Column({ name: 'bet_id', type: 'int' })
  betId: number;

  @Column({ name: 'ht_home', type: 'int', nullable: true })
  htHome: number | null;

  @Column({ name: 'ht_away', type: 'int', nullable: true })
  htAway: number | null;

  @Column({ type: 'boolean', default: false })
  settled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
