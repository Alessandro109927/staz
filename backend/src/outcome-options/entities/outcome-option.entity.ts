import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('outcome_options')
export class OutcomeOption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** standard | scorer (richiede nome giocatore in scommessa) */
  @Column({ type: 'varchar', length: 20, default: 'standard' })
  kind: string;
}
