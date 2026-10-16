import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MultigolScoutService } from '../multigol-scout/multigol-scout.service';

/**
 * Ricalcola con il modello corrente le partite (non iniziate) di uno o più giorni.
 * Uso: node dist/cli/recalc-scout-day.js [YYYY-MM-DD ...]   (default: oggi, fuso Roma)
 */
async function main(): Promise<void> {
  const days = process.argv.slice(2).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!days.length) {
    days.push(
      new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }),
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const scout = app.get(MultigolScoutService);
    for (const day of days) {
      const res = await scout.recalculateDay(day);
      console.log(JSON.stringify(res));
    }
    console.log(JSON.stringify(scout.getApiFootballUsage()));
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
