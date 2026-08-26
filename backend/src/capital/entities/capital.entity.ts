import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('capital')
export class Capital {
  @PrimaryGeneratedColumn()
  id: number;

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
