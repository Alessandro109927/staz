import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MultigolScoutOpportunityEntity } from './entities/multigol-scout-opportunity.entity';
import { MultigolScoutStateEntity } from './entities/multigol-scout-state.entity';
import type { MultigolOpportunity } from './multigol-scout.types';

const STATE_ID = 'default';

export type MultigolScoutSnapshotMeta = {
  from: string;
  to: string;
  builtAt: string | null;
  lastIncrementalAt: string | null;
  scanInProgress: boolean;
  itemCount: number;
};

@Injectable()
export class MultigolScoutStoreService {
  constructor(
    @InjectRepository(MultigolScoutOpportunityEntity)
    private readonly oppRepo: Repository<MultigolScoutOpportunityEntity>,
    @InjectRepository(MultigolScoutStateEntity)
    private readonly stateRepo: Repository<MultigolScoutStateEntity>,
  ) {}

  async getState(): Promise<MultigolScoutStateEntity | null> {
    return this.stateRepo.findOne({ where: { id: STATE_ID } });
  }

  async ensureState(windowFrom: string, windowTo: string): Promise<MultigolScoutStateEntity> {
    let row = await this.getState();
    if (!row) {
      row = this.stateRepo.create({
        id: STATE_ID,
        windowFrom,
        windowTo,
        lastFullScanAt: null,
        lastIncrementalAt: null,
        scanInProgress: false,
      });
      await this.stateRepo.save(row);
    }
    return row;
  }

  async setScanInProgress(value: boolean): Promise<void> {
    const row = await this.ensureState(
      (await this.defaultWindow()).from,
      (await this.defaultWindow()).to,
    );
    row.scanInProgress = value;
    await this.stateRepo.save(row);
  }

  async updateState(patch: Partial<MultigolScoutStateEntity>): Promise<void> {
    const row = await this.ensureState(
      patch.windowFrom ?? (await this.defaultWindow()).from,
      patch.windowTo ?? (await this.defaultWindow()).to,
    );
    Object.assign(row, patch);
    await this.stateRepo.save(row);
  }

  async replaceAll(items: MultigolOpportunity[], windowFrom: string, windowTo: string): Promise<void> {
    await this.oppRepo.clear();
    if (items.length) {
      await this.oppRepo.save(
        items.map((data) =>
          this.oppRepo.create({
            matchId: data.matchId,
            leagueKey: data.leagueCode,
            utcDate: new Date(data.utcDate),
            data,
          }),
        ),
      );
    }
    await this.updateState({
      windowFrom,
      windowTo,
      lastFullScanAt: new Date(),
      scanInProgress: false,
    });
  }

  async upsertMany(items: MultigolOpportunity[]): Promise<void> {
    if (!items.length) {
      return;
    }
    for (const data of items) {
      await this.oppRepo.save(
        this.oppRepo.create({
          matchId: data.matchId,
          leagueKey: data.leagueCode,
          utcDate: new Date(data.utcDate),
          data,
        }),
      );
    }
  }

  async deleteKickoffBefore(dayExclusive: string): Promise<number> {
    const result = await this.oppRepo
      .createQueryBuilder()
      .delete()
      .where('utc_date < :day', { day: `${dayExclusive}T00:00:00.000Z` })
      .execute();
    return result.affected ?? 0;
  }

  async listAll(): Promise<MultigolOpportunity[]> {
    const rows = await this.oppRepo.find({ order: { utcDate: 'ASC' } });
    return rows.map((r) => r.data);
  }

  async listByLeague(leagueKey: string): Promise<MultigolOpportunity[]> {
    const rows = await this.oppRepo.find({
      where: { leagueKey },
      order: { utcDate: 'ASC' },
    });
    return rows.map((r) => r.data);
  }

  async hasAny(): Promise<boolean> {
    return (await this.oppRepo.count()) > 0;
  }

  async getSnapshotMeta(): Promise<MultigolScoutSnapshotMeta> {
    const state = await this.getState();
    const count = await this.oppRepo.count();
    const bounds = await this.kickoffBounds();
    const win =
      bounds ??
      (state
        ? { from: state.windowFrom, to: state.windowTo }
        : await this.defaultWindow());
    return {
      from: win.from,
      to: win.to,
      builtAt: state?.lastFullScanAt?.toISOString() ?? null,
      lastIncrementalAt: state?.lastIncrementalAt?.toISOString() ?? null,
      scanInProgress: state?.scanInProgress ?? false,
      itemCount: count,
    };
  }

  /** Estremi kickoff effettivi in DB (lista e filtri data). */
  private async kickoffBounds(): Promise<{ from: string; to: string } | null> {
    if ((await this.oppRepo.count()) === 0) {
      return null;
    }
    const row = await this.oppRepo
      .createQueryBuilder('o')
      .select('MIN(o.utcDate)', 'minDate')
      .addSelect('MAX(o.utcDate)', 'maxDate')
      .getRawOne<{ minDate: Date | null; maxDate: Date | null }>();
    if (!row?.minDate || !row?.maxDate) {
      return null;
    }
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { from: fmt(row.minDate), to: fmt(row.maxDate) };
  }

  private async defaultWindow(): Promise<{ from: string; to: string }> {
    const today = new Date();
    const end = new Date(today.getTime() + 7 * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { from: fmt(today), to: fmt(end) };
  }
}
