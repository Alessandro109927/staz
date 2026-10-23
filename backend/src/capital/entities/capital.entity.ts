import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('capital')
@Unique(['userId', 'organizationId'])
export class Capital {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ name: 'organization_id', type: 'int', nullable: true })
  organizationId: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  initialCapital: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    name: 'starting_capital',
    nullable: true,
  })
  startingCapital: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  currentCapital: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
