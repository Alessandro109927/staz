import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { MultigolOpportunity } from '../multigol-scout.types';

@Entity('multigol_scout_opportunity')
@Index(['leagueKey'])
@Index(['utcDate'])
export class MultigolScoutOpportunityEntity {
  @PrimaryColumn({ type: 'integer' })
  matchId!: number;

  @Column({ type: 'varchar', length: 64 })
  leagueKey!: string;

  @Column({ type: 'timestamptz' })
  utcDate!: Date;

  @Column({ type: 'jsonb' })
  data!: MultigolOpportunity;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
