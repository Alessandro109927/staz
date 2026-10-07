import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type {
  MultigolScoutCalibrationStorage,
  LegacyHighBandCalibration,
} from '../multigol-scout-calibration.types';

const CALIBRATION_ID = 'default';

@Entity('multigol_scout_calibration')
export class MultigolScoutCalibrationEntity {
  @PrimaryColumn({ type: 'varchar', length: 16, default: CALIBRATION_ID })
  id!: string;

  @Column({ type: 'jsonb', nullable: true })
  bands!: MultigolScoutCalibrationStorage | null;

  /** @deprecated migrato in `bands['90-100']`. */
  @Column({ type: 'jsonb', nullable: true })
  highBand!: LegacyHighBandCalibration | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

export { CALIBRATION_ID };
