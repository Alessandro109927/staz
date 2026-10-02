import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateOutcomeOptionDto,
  UpdateOutcomeOptionDto,
} from './dto/outcome-option.dto';
import { OutcomeOption } from './entities/outcome-option.entity';

@Injectable()
export class OutcomeOptionsService implements OnModuleInit {
  constructor(
    @InjectRepository(OutcomeOption)
    private readonly repository: Repository<OutcomeOption>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.manager.query(`
      ALTER TABLE "outcome_options"
      ADD COLUMN IF NOT EXISTS "kind" character varying(20) NOT NULL DEFAULT 'standard'
    `);
  }

  findAll(userId: number) {
    return this.repository.find({
      where: { userId },
      order: { label: 'ASC', id: 'ASC' },
    });
  }

  async create(userId: number, dto: CreateOutcomeOptionDto) {
    const label = dto.label.trim();
    await this.assertLabelAvailable(userId, label);

    let sortOrder = dto.sortOrder;
    if (sortOrder == null) {
      const max = await this.repository
        .createQueryBuilder('o')
        .select('MAX(o.sortOrder)', 'max')
        .where('o.userId = :userId', { userId })
        .getRawOne<{ max: number | null }>();
      sortOrder = (max?.max ?? -1) + 1;
    }

    const row = this.repository.create({
      userId,
      label,
      description: this.normalizeDescription(dto.description),
      sortOrder,
      kind: dto.kind ?? 'standard',
    });
    return this.repository.save(row);
  }

  async update(userId: number, id: number, dto: UpdateOutcomeOptionDto) {
    const row = await this.findOne(userId, id);

    if (dto.label !== undefined) {
      const label = dto.label.trim();
      if (label.toLowerCase() !== row.label.toLowerCase()) {
        await this.assertLabelAvailable(userId, label, id);
      }
      row.label = label;
    }
    if (dto.sortOrder !== undefined) {
      row.sortOrder = dto.sortOrder;
    }
    if (dto.description !== undefined) {
      row.description = this.normalizeDescription(dto.description);
    }
    if (dto.kind !== undefined) {
      row.kind = dto.kind;
    }

    return this.repository.save(row);
  }

  private normalizeDescription(value: string | null | undefined): string | null {
    if (value == null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async remove(userId: number, id: number) {
    const row = await this.findOne(userId, id);
    await this.repository.remove(row);
    return { deleted: true };
  }

  private async findOne(userId: number, id: number) {
    const row = await this.repository.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException(`Esito ${id} non trovato`);
    }
    return row;
  }

  private async assertLabelAvailable(
    userId: number,
    label: string,
    excludeId?: number,
  ) {
    const existing = await this.repository.find({ where: { userId } });
    const clash = existing.some(
      (row) =>
        row.label.toLowerCase() === label.toLowerCase() &&
        row.id !== excludeId,
    );
    if (clash) {
      throw new ConflictException('Esito già presente in elenco');
    }
  }
}
