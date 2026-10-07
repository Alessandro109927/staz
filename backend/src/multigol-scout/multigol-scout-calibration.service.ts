import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MULTIGOL_SCOUT_CALIBRATION_BAND_DEFS } from './multigol-scout-calibration.constants';
import {
  MultigolScoutCalibrationEntity,
  CALIBRATION_ID,
} from './entities/multigol-scout-calibration.entity';
import { MultigolScoutPickResultEntity } from './entities/multigol-scout-pick-result.entity';
import { MultigolScoutOpportunityEntity } from './entities/multigol-scout-opportunity.entity';
import {
  emptyCalibrationStorage,
  type MultigolScoutBandStats,
  type MultigolScoutCalibrationStorage,
  type MultigolScoutCalibrationSummary,
  type MultigolScoutMetricKey,
  type MultigolScoutPickResultValue,
} from './multigol-scout-calibration.types';
import type { MultigolOpportunity } from './multigol-scout.types';
import { bandIdForPercent, isHit, metricPercent } from './multigol-scout-calibration.util';

const METRICS: MultigolScoutMetricKey[] = ['synthesis', 'poisson', 'empirical'];

@Injectable()
export class MultigolScoutCalibrationService {
  constructor(
    @InjectRepository(MultigolScoutPickResultEntity)
    private readonly pickRepo: Repository<MultigolScoutPickResultEntity>,
    @InjectRepository(MultigolScoutCalibrationEntity)
    private readonly calRepo: Repository<MultigolScoutCalibrationEntity>,
    @InjectRepository(MultigolScoutOpportunityEntity)
    private readonly oppRepo: Repository<MultigolScoutOpportunityEntity>,
  ) {}

  async listPickResultsMap(): Promise<Record<number, MultigolScoutPickResultValue>> {
    const rows = await this.pickRepo.find();
    const out: Record<number, MultigolScoutPickResultValue> = {};
    for (const row of rows) {
      out[row.matchId] = row.result;
    }
    return out;
  }

  async getSummary(): Promise<MultigolScoutCalibrationSummary> {
    const [cal, labeledPickCount, opportunityCount] = await Promise.all([
      this.ensureCalibrationRow(),
      this.pickRepo.count(),
      this.oppRepo.count(),
    ]);
    const storage = cal.bands ?? emptyCalibrationStorage();
    return {
      bands: [...MULTIGOL_SCOUT_CALIBRATION_BAND_DEFS]
        .sort((a, b) => b.min - a.min)
        .map((def) => {
        const slice = storage[def.id];
        return {
          id: def.id,
          label: def.label,
          min: def.min,
          max: def.max,
          synthesis: { ...slice.synthesis },
          poisson: { ...slice.poisson },
          empirical: { ...slice.empirical },
        };
      }),
      labeledPickCount,
      opportunityCount,
      updatedAt: cal.updatedAt?.toISOString() ?? null,
    };
  }

  async setPickResult(
    matchId: number,
    result: MultigolScoutPickResultValue | null,
  ): Promise<{
    pickResults: Record<number, MultigolScoutPickResultValue>;
    calibration: MultigolScoutCalibrationSummary;
  }> {
    const opp = await this.oppRepo.findOne({ where: { matchId } });
    if (!opp) {
      throw new NotFoundException(`Partita ${matchId} non nello snapshot`);
    }

    const existing = await this.pickRepo.findOne({ where: { matchId } });
    const previous = existing?.result ?? null;

    if (result == null) {
      if (existing) {
        await this.applyDelta(opp.data, previous, null);
        await this.pickRepo.delete({ matchId });
      }
    } else {
      if (previous) {
        await this.applyDelta(opp.data, previous, null);
      }
      await this.applyDelta(opp.data, null, result);
      await this.pickRepo.save(this.pickRepo.create({ matchId, result }));
    }

    const [pickResults, calibration] = await Promise.all([
      this.listPickResultsMap(),
      this.getSummary(),
    ]);
    return { pickResults, calibration };
  }

  async importPickResults(
    items: Array<{ matchId: number; result: MultigolScoutPickResultValue }>,
  ): Promise<{
    pickResults: Record<number, MultigolScoutPickResultValue>;
    calibration: MultigolScoutCalibrationSummary;
  }> {
    for (const item of items) {
      if (item.result !== 'WON' && item.result !== 'LOST') {
        continue;
      }
      const opp = await this.oppRepo.findOne({ where: { matchId: item.matchId } });
      if (!opp) {
        continue;
      }
      const existing = await this.pickRepo.findOne({
        where: { matchId: item.matchId },
      });
      const previous = existing?.result ?? null;
      if (previous === item.result) {
        continue;
      }
      if (previous) {
        await this.applyDelta(opp.data, previous, null);
      }
      await this.applyDelta(opp.data, null, item.result);
      await this.pickRepo.save(
        this.pickRepo.create({ matchId: item.matchId, result: item.result }),
      );
    }
    const [pickResults, calibration] = await Promise.all([
      this.listPickResultsMap(),
      this.getSummary(),
    ]);
    return { pickResults, calibration };
  }

  private async applyDelta(
    opp: MultigolOpportunity,
    remove: MultigolScoutPickResultValue | null,
    add: MultigolScoutPickResultValue | null,
  ): Promise<void> {
    const row = await this.ensureCalibrationRow();
    const next = cloneStorage(row.bands ?? emptyCalibrationStorage());

    for (const metric of METRICS) {
      const percent = metricPercent(opp, metric);
      const bandId = bandIdForPercent(percent ?? NaN);
      if (!bandId || percent == null) {
        continue;
      }
      const band = next[bandId][metric];
      if (remove) {
        adjustBand(band, percent, remove, -1);
      }
      if (add) {
        adjustBand(band, percent, add, 1);
      }
    }

    row.bands = next;
    await this.calRepo.save(row);
  }

  private async ensureCalibrationRow(): Promise<MultigolScoutCalibrationEntity> {
    let row = await this.calRepo.findOne({ where: { id: CALIBRATION_ID } });
    if (!row) {
      row = this.calRepo.create({
        id: CALIBRATION_ID,
        bands: emptyCalibrationStorage(),
        highBand: null,
      });
      await this.calRepo.save(row);
      return row;
    }
    if (!row.bands) {
      row.bands = emptyCalibrationStorage();
      row.highBand = null;
      await this.calRepo.save(row);
      await this.rebuildFromAllPickResults();
      row = (await this.calRepo.findOne({ where: { id: CALIBRATION_ID } }))!;
    }
    return row;
  }

  /** Ricalcolo completo (solo migrazione / manutenzione). */
  private async rebuildFromAllPickResults(): Promise<void> {
    const row = await this.calRepo.findOne({ where: { id: CALIBRATION_ID } });
    if (!row) {
      return;
    }
    row.bands = emptyCalibrationStorage();
    await this.calRepo.save(row);

    const picks = await this.pickRepo.find();
    for (const pick of picks) {
      const opp = await this.oppRepo.findOne({ where: { matchId: pick.matchId } });
      if (!opp) {
        continue;
      }
      await this.applyDelta(opp.data, null, pick.result);
    }
  }
}

function cloneStorage(src: MultigolScoutCalibrationStorage): MultigolScoutCalibrationStorage {
  const out = emptyCalibrationStorage();
  for (const def of MULTIGOL_SCOUT_CALIBRATION_BAND_DEFS) {
    const slice = src[def.id];
    out[def.id] = {
      synthesis: { ...slice.synthesis },
      poisson: { ...slice.poisson },
      empirical: { ...slice.empirical },
    };
  }
  return out;
}

function adjustBand(
  band: MultigolScoutBandStats,
  percent: number,
  result: MultigolScoutPickResultValue,
  sign: 1 | -1,
): void {
  band.total += sign;
  if (isHit(result)) {
    band.hits += sign;
  }
  band.sumPercent += sign * percent;
  if (band.total <= 0) {
    band.total = 0;
    band.hits = 0;
    band.sumPercent = 0;
  } else if (band.hits < 0) {
    band.hits = 0;
  }
}
