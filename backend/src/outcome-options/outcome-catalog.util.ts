import { existsSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OUTCOME_OPTION_KINDS } from './dto/outcome-option.dto';
import { OutcomeOption } from './entities/outcome-option.entity';

export type OutcomeCatalogRow = {
  label: string;
  description?: string | null;
  kind?: (typeof OUTCOME_OPTION_KINDS)[number];
  sortOrder?: number;
};

export function compareOutcomeLabels(a: string, b: string): number {
  return a.localeCompare(b, 'it', { sensitivity: 'base', numeric: true });
}

export function outcomeOptionsToCatalogRows(
  rows: OutcomeOption[],
): OutcomeCatalogRow[] {
  return [...rows]
    .sort((a, b) => compareOutcomeLabels(a.label, b.label))
    .map((row, index) => ({
      label: row.label,
      description: row.description,
      kind: (row.kind ?? 'standard') as OutcomeCatalogRow['kind'],
      sortOrder: index,
    }));
}

export function resolveOutcomeCatalogSyncPath(
  configuredPath: string | undefined,
): string | null {
  const trimmed = configuredPath?.trim();
  if (trimmed) {
    return trimmed;
  }

  const candidates = [
    join(process.cwd(), 'data', 'outcome-catalog.json'),
    join(process.cwd(), '..', 'data', 'outcome-catalog.json'),
  ];

  for (const path of candidates) {
    if (existsSync(dirname(path))) {
      return path;
    }
  }

  return candidates[1];
}

export function writeOutcomeCatalogFile(
  path: string,
  rows: OutcomeCatalogRow[],
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
}
