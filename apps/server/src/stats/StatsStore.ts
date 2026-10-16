import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LeaderboardEntry } from '@poker/shared';
import { z } from 'zod';

/** Ce que le salon rapporte, pour chaque participant, à la fin d'une main. */
export interface HandStat {
  token: string;
  nickname: string;
  color: string;
  /** Tapis final − tapis au début de la main (négatif si perdu). */
  net: number;
  /** A remporté tout ou partie d'un pot. */
  won: boolean;
  /** Montant remporté dans la main. */
  potWon: number;
}

const playerSchema = z.object({
  nickname: z.string().max(32),
  color: z.string().max(32),
  handsPlayed: z.int().min(0),
  handsWon: z.int().min(0),
  net: z.int(),
  biggestPot: z.int().min(0),
  lastPlayedAt: z.number(),
});
const fileSchema = z.object({ version: z.literal(1), players: z.record(z.string(), playerSchema) });
type PlayerStats = z.infer<typeof playerSchema>;

/**
 * Identifiant public et stable d'un joueur, d'un salon à l'autre : empreinte SHA-256
 * de son jeton secret. On peut l'afficher sans risque : impossible de remonter au jeton.
 */
export function playerKey(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/**
 * Statistiques par joueur (classement de l'accueil), gardées en mémoire et sauvegardées
 * dans un simple fichier JSON (pas de base de données). Les parties, elles, restent
 * uniquement en mémoire.
 */
export class StatsStore {
  private readonly players = new Map<string, PlayerStats>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Prévenu après chaque main enregistrée (pour pousser le classement aux clients). */
  onChange: () => void = () => {};

  constructor(
    /** Fichier de sauvegarde, ou null pour ne rien écrire (tests). */
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {}

  /** Recharge le fichier s'il existe. Un fichier illisible est ignoré (et signalé), sans planter. */
  async load(): Promise<void> {
    if (!this.file) return;
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch {
      return; // Premier démarrage : pas encore de fichier.
    }
    const parsed = fileSchema.safeParse(safeJson(raw));
    if (!parsed.success) {
      console.error(`[stats] ${this.file} illisible, classement repris à zéro`);
      return;
    }
    for (const [key, stats] of Object.entries(parsed.data.players)) this.players.set(key, stats);
  }

  record(hand: HandStat[]): void {
    const now = this.now();
    for (const stat of hand) {
      const key = playerKey(stat.token);
      const current = this.players.get(key) ?? {
        nickname: stat.nickname,
        color: stat.color,
        handsPlayed: 0,
        handsWon: 0,
        net: 0,
        biggestPot: 0,
        lastPlayedAt: now,
      };
      this.players.set(key, {
        nickname: stat.nickname,
        color: stat.color,
        handsPlayed: current.handsPlayed + 1,
        handsWon: current.handsWon + (stat.won ? 1 : 0),
        net: current.net + stat.net,
        biggestPot: Math.max(current.biggestPot, stat.potWon),
        lastPlayedAt: now,
      });
    }
    this.scheduleSave();
    this.onChange();
  }

  /** Classement : gains nets décroissants, puis mains gagnées. */
  leaderboard(limit = 20): LeaderboardEntry[] {
    return [...this.players.entries()]
      .map(([id, s]) => ({ id, ...s }))
      .sort(
        (a, b) => b.net - a.net || b.handsWon - a.handsWon || a.nickname.localeCompare(b.nickname),
      )
      .slice(0, limit);
  }

  /** Écrit immédiatement (arrêt du serveur). */
  async flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.save();
  }

  private scheduleSave(): void {
    if (!this.file || this.saveTimer) return;
    // On regroupe les écritures : au plus une toutes les 2 s.
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 2_000);
    this.saveTimer.unref();
  }

  private async save(): Promise<void> {
    if (!this.file) return;
    const data = { version: 1, players: Object.fromEntries(this.players) };
    try {
      await mkdir(dirname(this.file), { recursive: true });
      // Écriture atomique : fichier temporaire puis renommage. Un arrêt brutal pendant
      // l'écriture ne laisse jamais un fichier à moitié écrit.
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(data));
      await rename(tmp, this.file);
    } catch (error) {
      console.error('[stats] sauvegarde impossible :', error);
    }
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
