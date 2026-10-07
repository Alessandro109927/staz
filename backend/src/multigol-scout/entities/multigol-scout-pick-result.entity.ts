import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { MultigolScoutPickResultValue } from '../multigol-scout-calibration.types';

@Entity('multigol_scout_pick_result')
export class MultigolScoutPickResultEntity {
  @PrimaryColumn({ type: 'integer' })
  matchId!: number;

  @Column({ type: 'varchar', length: 8 })
  result!: MultigolScoutPickResultValue;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
