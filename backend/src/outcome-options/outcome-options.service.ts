import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import {
  CreateOutcomeOptionDto,
  UpdateOutcomeOptionDto,
} from './dto/outcome-option.dto';
import { ImportOutcomeOptionItemDto } from './dto/import-outcome-options.dto';
import { OutcomeOption } from './entities/outcome-option.entity';
import {
  OutcomeCatalogRow,
  compareOutcomeLabels,
  outcomeOptionsToCatalogRows,
  resolveOutcomeCatalogSyncPath,
  writeOutcomeCatalogFile,
} from './outcome-catalog.util';

function parseCatalogRows(raw: unknown): OutcomeCatalogRow[] {
  if (!Array.isArray(raw)) {
    throw new Error('Il catalogo esiti deve essere un array JSON');
  }
  return raw as OutcomeCatalogRow[];
}

function loadCatalogFromFile(): OutcomeCatalogRow[] {
  const filePath = join(__dirname, 'outcome-catalog.json');
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  return parseCatalogRows(parsed);
}

@Injectable()
export class OutcomeOptionsService implements OnModuleInit {
  private readonly logger = new Logger(OutcomeOptionsService.name);

  constructor(
    @InjectRepository(OutcomeOption)
    private readonly repository: Repository<OutcomeOption>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.manager.query(`
      ALTER TABLE "outcome_options"
      ADD COLUMN IF NOT EXISTS "kind" character varying(20) NOT NULL DEFAULT 'standard'
    `);
  }

  async findAll(userId: number) {
    return this.repository.find({
      where: { userId },
      order: { sortOrder: 'ASC', label: 'ASC', id: 'ASC' },
    });
  }

  async exportCatalog(userId: number): Promise<OutcomeCatalogRow[]> {
    const rows = await this.findAll(userId);
    return outcomeOptionsToCatalogRows(rows);
  }

  /** Importa righe da JSON (file o body). `replace`: sostituisce l'elenco utente. */
  async importCatalog(
    userId: number,
    rows: ImportOutcomeOptionItemDto[] | OutcomeCatalogRow[],
    replace = false,
  ) {
    const catalog = rows.map((row) => ({
      label: row.label.trim(),
      description: this.normalizeDescription(row.description),
      kind: row.kind ?? 'standard',
    }));

    if (catalog.length === 0) {
      throw new ConflictException('Il catalogo esiti è vuoto');
    }

    const labels = catalog.map((r) => r.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      throw new ConflictException('Etichette duplicate nel JSON importato');
    }

    if (replace) {
      await this.repository.delete({ userId });
    }

    const existing = await this.repository.find({ where: { userId } });
    const byLabel = new Map(
      existing.map((row) => [row.label.toLowerCase(), row]),
    );

    const toSave: OutcomeOption[] = [];

    for (const row of catalog) {
      const key = row.label.toLowerCase();
      const current = byLabel.get(key);
      if (current) {
        current.description = row.description;
        current.kind = row.kind;
        toSave.push(current);
      } else {
        toSave.push(
          this.repository.create({
            userId,
            label: row.label,
            description: row.description,
            sortOrder: 0,
            kind: row.kind,
          }),
        );
      }
    }

    await this.repository.save(toSave);
    return this.finalizeCatalog(userId);
  }

  importDefaultCatalog(userId: number, replace = false) {
    return this.importCatalog(userId, loadCatalogFromFile(), replace);
  }

  async create(userId: number, dto: CreateOutcomeOptionDto) {
    const label = dto.label.trim();
    await this.assertLabelAvailable(userId, label);

    const row = this.repository.create({
      userId,
      label,
      description: this.normalizeDescription(dto.description),
      sortOrder: 0,
      kind: dto.kind ?? 'standard',
    });
    await this.repository.save(row);
    await this.finalizeCatalog(userId);
    return this.findOne(userId, row.id);
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
    if (dto.description !== undefined) {
      row.description = this.normalizeDescription(dto.description);
    }
    if (dto.kind !== undefined) {
      row.kind = dto.kind;
    }

    await this.repository.save(row);
    await this.finalizeCatalog(userId);
    return this.findOne(userId, id);
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
    await this.finalizeCatalog(userId);
    return { deleted: true };
  }

  private async finalizeCatalog(userId: number) {
    await this.applyAlphabeticalOrder(userId);
    await this.syncCatalogJsonFile(userId);
    return this.findAll(userId);
  }

  private async applyAlphabeticalOrder(userId: number) {
    const rows = await this.repository.find({ where: { userId } });
    rows.sort((a, b) => compareOutcomeLabels(a.label, b.label));
    rows.forEach((row, index) => {
      row.sortOrder = index;
    });
    if (rows.length > 0) {
      await this.repository.save(rows);
    }
  }

  private async syncCatalogJsonFile(userId: number) {
    const path = resolveOutcomeCatalogSyncPath(
      this.configService.get<string>('OUTCOME_CATALOG_SYNC_PATH'),
    );
    if (!path) {
      return;
    }

    try {
      const catalog = await this.exportCatalog(userId);
      writeOutcomeCatalogFile(path, catalog);
    } catch (err) {
      this.logger.warn(
        `Impossibile scrivere il catalogo esiti su ${path}: ${err instanceof Error ? err.message : err}`,
      );
    }
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
