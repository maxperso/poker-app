import type { Blinds } from '@poker/engine';

/** Multiplicateurs des niveaux de blinds croissantes, appliqués aux blinds de départ. */
const LEVEL_MULTIPLIERS = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 50, 60, 80, 100];

/** Blinds du niveau `level` (0 = blinds de départ). Le dernier niveau se répète. */
export function blindsForLevel(base: Blinds, level: number): Blinds {
  const index = Math.min(Math.max(0, level), LEVEL_MULTIPLIERS.length - 1);
  const multiplier = LEVEL_MULTIPLIERS[index] as number;
  return { small: Math.round(base.small * multiplier), big: Math.round(base.big * multiplier) };
}

/**
 * Couleur d'avatar dérivée du pseudo : le même pseudo a toujours la même couleur,
 * sans rien stocker. Teinte tirée d'un hash, saturation et luminosité fixes pour rester lisible.
 */
export function avatarColor(nickname: string): string {
  let hash = 0;
  for (const char of nickname.toLowerCase()) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return `hsl(${hash % 360} 65% 45%)`;
}

/** Comparaison de pseudos insensible à la casse et aux accents (« Élodie » = « elodie »). */
export function sameNickname(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .trim()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  return normalize(a) === normalize(b);
}
