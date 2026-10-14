import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MultigolScoutService } from '../multigol-scout/multigol-scout.service';
import type { MultigolOpportunity } from '../multigol-scout/multigol-scout.types';

function sqlEscapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "''");
}

function opportunityInsert(data: MultigolOpportunity): string {
  const json = sqlEscapeJson(data);
  const utc = data.utcDate.replace('T', ' ').replace('Z', '+00');
  return (
    `INSERT INTO public.multigol_scout_opportunity ("matchId", "leagueKey", "utcDate", data, "updatedAt") ` +
    `VALUES (${data.matchId}, '${data.leagueCode}', '${utc}', '${json}'::jsonb, NOW()) ` +
    `ON CONFLICT ("matchId") DO UPDATE SET "leagueKey" = EXCLUDED."leagueKey", "utcDate" = EXCLUDED."utcDate", data = EXCLUDED.data, "updatedAt" = NOW();`
  );
}

async function main(): Promise<void> {
  const leaguesArg = process.argv[2] ?? 'UCL,UEL,UECL';
  const exportRel = process.argv[3];
  const leagues = leaguesArg
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const scout = app.get(MultigolScoutService);
    const meta = await scout.refreshLeaguesSnapshot(leagues);
    const snap = await scout.getSnapshot();
    const codes = new Set(leagues.map((l) => l.toUpperCase()));
    const items = snap.items.filter((i) =>
      codes.has(i.leagueCode.toUpperCase()),
    );

    console.log(
      JSON.stringify(
        {
          leagues,
          itemCount: items.length,
          meta,
        },
        null,
        2,
      ),
    );

    if (exportRel) {
      const out = resolve(process.cwd(), exportRel);
      const header = [
        '-- Scout Multigol: coppe UEFA (UCL / UEL / UECL)',
        `-- Generated: ${new Date().toISOString()}`,
        `-- Rows: ${items.length}`,
        '',
        `DELETE FROM public.multigol_scout_opportunity WHERE "leagueKey" IN (${[...codes].map((c) => `'${c}'`).join(', ')});`,
        '',
      ];
      writeFileSync(
        out,
        [...header, ...items.map(opportunityInsert), ''].join('\n'),
        'utf8',
      );
      console.log(`Export SQL: ${out}`);
    }
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
