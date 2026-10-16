/** Ce qu'un joueur a mis dans la main (toutes rues confondues). */
export interface Contribution {
  seat: number;
  amount: number;
  folded: boolean;
}

export interface Pot {
  amount: number;
  /** Sièges qui peuvent gagner ce pot : ceux qui ne se sont pas couchés et ont assez misé. */
  eligibleSeats: number[];
}

export interface PotAward {
  potIndex: number;
  amount: number;
  winners: { seat: number; amount: number }[];
}

/**
 * Mise non suivie : si le plus gros contributeur a mis plus que tous les autres,
 * l'excédent n'a été suivi par personne et lui revient (ex. tapis de 500 contre un tapis de 200).
 */
export function findUncalledBet(
  contributions: readonly Contribution[],
): { seat: number; amount: number } | null {
  const sorted = [...contributions].sort((a, b) => b.amount - a.amount);
  const [top, second] = sorted;
  if (!top) return null;
  const excess = top.amount - (second?.amount ?? 0);
  return excess > 0 ? { seat: top.seat, amount: excess } : null;
}

/**
 * Découpe les contributions en pot principal + side pots.
 *
 * On empile les mises par « niveaux » : chaque montant total d'un joueur encore en jeu
 * (typiquement un tapis) ferme un niveau. Le pot d'un niveau reçoit, de chaque joueur,
 * la part de sa mise comprise dans ce niveau ; seuls les joueurs non couchés qui ont
 * atteint ce niveau peuvent le gagner. Les joueurs couchés alimentent les pots sans
 * pouvoir les gagner.
 *
 * Exemple : A tapis 50, B 200, C 200 → principal 150 (A, B, C), side pot 300 (B, C).
 *
 * À appeler après avoir rendu la mise non suivie (findUncalledBet).
 */
export function buildPots(contributions: readonly Contribution[]): Pot[] {
  const levels = [
    ...new Set(contributions.filter((c) => !c.folded && c.amount > 0).map((c) => c.amount)),
  ].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let previousLevel = 0;
  for (const level of levels) {
    const amount = contributions.reduce(
      (sum, c) => sum + Math.max(0, Math.min(c.amount, level) - previousLevel),
      0,
    );
    const eligibleSeats = contributions
      .filter((c) => !c.folded && c.amount >= level)
      .map((c) => c.seat)
      .sort((a, b) => a - b);
    pots.push({ amount, eligibleSeats });
    previousLevel = level;
  }

  // Filet de sécurité : des jetons de joueurs couchés au-delà du plus haut niveau
  // (ne devrait pas arriver si la mise non suivie a été rendue) vont dans le dernier pot.
  const leftover = contributions.reduce((sum, c) => sum + Math.max(0, c.amount - previousLevel), 0);
  const lastPot = pots.at(-1);
  if (leftover > 0 && lastPot) lastPot.amount += leftover;

  return pots;
}

/**
 * Attribue chaque pot au(x) meilleur(s) score(s) parmi ses sièges éligibles.
 *
 * - `scores` : score de main par siège (HandValue.score). Inutile pour un pot à un seul éligible.
 * - `oddChipOrder` : ordre des sièges en partant de la gauche du bouton. En cas de partage
 *   inégal, les jetons restants vont un par un aux gagnants dans cet ordre (règle classique).
 */
export function awardPots(
  pots: readonly Pot[],
  scores: ReadonlyMap<number, number>,
  oddChipOrder: readonly number[],
): PotAward[] {
  return pots.map((pot, potIndex) => {
    const winnerSeats = bestSeats(pot.eligibleSeats, scores).sort(
      (a, b) => orderIndex(oddChipOrder, a) - orderIndex(oddChipOrder, b),
    );
    const share = Math.floor(pot.amount / winnerSeats.length);
    let remainder = pot.amount - share * winnerSeats.length;
    const winners = winnerSeats.map((seat) => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      return { seat, amount: share + extra };
    });
    return { potIndex, amount: pot.amount, winners };
  });
}

function bestSeats(eligible: readonly number[], scores: ReadonlyMap<number, number>): number[] {
  if (eligible.length === 1) return [...eligible];
  const scored = eligible.map((seat) => {
    const score = scores.get(seat);
    if (score === undefined) throw new Error(`Score manquant pour le siège ${seat}`);
    return { seat, score };
  });
  const top = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === top).map((s) => s.seat);
}

function orderIndex(order: readonly number[], seat: number): number {
  const index = order.indexOf(seat);
  if (index === -1) throw new Error(`Siège ${seat} absent de l'ordre de distribution`);
  return index;
}
