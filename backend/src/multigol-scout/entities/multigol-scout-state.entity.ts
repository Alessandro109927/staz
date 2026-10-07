import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('multigol_scout_state')
export class MultigolScoutStateEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id!: string;

  @Column({ type: 'date' })
  windowFrom!: string;

  @Column({ type: 'date' })
  windowTo!: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastFullScanAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastIncrementalAt!: Date | null;

  @Column({ type: 'boolean', default: false })
  scanInProgress!: boolean;
}
