import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MatchDossier } from './multigol-dossier.util';

@Injectable()
export class MultigolNarrativeService {
  private readonly logger = new Logger(MultigolNarrativeService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('OPENAI_API_KEY')?.trim());
  }

  async explain(dossier: MatchDossier): Promise<string | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey || !dossier.pick) {
      return null;
    }
    const model = this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');

    const system = [
      'Sei analista calcistico per scommesse multigol.',
      'Scrivi SOLO in italiano, 250-450 parole.',
      'Devi spiegare PERCHÉ ha senso (o i rischi) dell\'esito indicato: Multigol Casa 1-6 o Multigol Ospite 1-6.',
      'Usa esclusivamente i dati nel JSON (classifica, forma gol, H2H, probabilità, lambda).',
      'Non inventare infortuni, formazioni o quote bookmaker.',
      'Struttura: 1) Contesto partita 2) Dati a favore 3) Rischi 4) Conclusione operativa per lo scommettitore.',
    ].join(' ');

    const user = JSON.stringify({
      match: dossier.eventName,
      league: dossier.leagueName,
      date: dossier.utcDate,
      recommendedOutcome: dossier.pick.outcomeLabel,
      modelProbabilityPercent: Math.round(dossier.pick.probability * 1000) / 10,
      lambdaHome: dossier.lambdaHome,
      lambdaAway: dossier.lambdaAway,
      pHome1to6Percent: Math.round(dossier.pHome1to6 * 1000) / 10,
      pAway1to6Percent: Math.round(dossier.pAway1to6 * 1000) / 10,
      stats: dossier.stats,
    });

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`OpenAI ${res.status}: ${body.slice(0, 180)}`);
        return null;
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      this.logger.warn(String(err));
      return null;
    }
  }
}
