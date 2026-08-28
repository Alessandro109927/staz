import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('staking_rules')
export class StakingRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'min_odds' })
  minOdds: string;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    name: 'max_odds',
    nullable: true,
  })
  maxOdds: string | null;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    name: 'stake_percentage',
  })
  stakePercentage: string;
}
