import { type Card, rankOf, rankValue, suitOf } from './cards';

export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
} as const;
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

export interface HandValue {
  category: HandCategory;
  /** Valeurs de départage, de la plus importante à la moins importante (2 à 14). */
  tiebreakers: number[];
  /** Plus grand = meilleure main. Deux mains de même force ont exactement le même score. */
  score: number;
  /** Les 5 cartes retenues, dans l'ordre d'importance (utile pour les surligner à l'écran). */
  cards: Card[];
}

const ACE = 14;

/** Évalue exactement 5 cartes. */
export function evaluateFive(cards: readonly Card[]): HandValue {
  if (cards.length !== 5) throw new Error(`evaluateFive attend 5 cartes, reçu ${cards.length}`);

  // Regroupe par rang, puis trie : groupes les plus gros d'abord, à taille égale le rang le plus haut.
  // Ex. full K-K-K-7-7 → [[13, ×3], [7, ×2]] ; c'est directement l'ordre de départage.
  const byRank = new Map<number, Card[]>();
  for (const card of cards) {
    const value = rankValue(rankOf(card));
    byRank.set(value, [...(byRank.get(value) ?? []), card]);
  }
  const groups = [...byRank.entries()].sort(
    ([valueA, cardsA], [valueB, cardsB]) => cardsB.length - cardsA.length || valueB - valueA,
  );
  const counts = groups.map(([, group]) => group.length);
  const values = groups.map(([value]) => value);

  const isFlush = cards.every((card) => suitOf(card) === suitOf(cards[0] as Card));
  const straightHigh = findStraightHigh(values);

  let category: HandCategory;
  if (straightHigh !== null && isFlush) category = HandCategory.StraightFlush;
  else if (counts[0] === 4) category = HandCategory.FourOfAKind;
  else if (counts[0] === 3 && counts[1] === 2) category = HandCategory.FullHouse;
  else if (isFlush) category = HandCategory.Flush;
  else if (straightHigh !== null) category = HandCategory.Straight;
  else if (counts[0] === 3) category = HandCategory.ThreeOfAKind;
  else if (counts[0] === 2 && counts[1] === 2) category = HandCategory.TwoPair;
  else if (counts[0] === 2) category = HandCategory.Pair;
  else category = HandCategory.HighCard;

  const ordered = groups.flatMap(([, group]) => group);
  // Pour une quinte, seule la carte haute départage ; dans la « roue » A-2-3-4-5, l'As vaut 1.
  const tiebreakers = straightHigh !== null ? [straightHigh] : values;
  if (straightHigh === 5) ordered.push(ordered.shift() as Card);

  return { category, tiebreakers, score: computeScore(category, tiebreakers), cards: ordered };
}

/** Évalue la meilleure main de 5 cartes parmi 5 à 7 (2 privées + le board). */
export function evaluateBest(cards: readonly Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluateBest attend 5 à 7 cartes, reçu ${cards.length}`);
  }
  if (new Set(cards).size !== cards.length)
    throw new Error(`Cartes en double : ${cards.join(' ')}`);

  // Au plus C(7,5) = 21 combinaisons : largement assez rapide pour une table entre amis,
  // et beaucoup plus lisible qu'un évaluateur à tables précalculées.
  let best: HandValue | null = null;
  for (const five of combinations(cards, 5)) {
    const value = evaluateFive(five);
    if (best === null || value.score > best.score) best = value;
  }
  return best as HandValue;
}

/** > 0 si `a` gagne, < 0 si `b` gagne, 0 en cas d'égalité. */
export function compareHands(a: HandValue, b: HandValue): number {
  return a.score - b.score;
}

/** Nom de la main en français, pour l'abattage : « Full aux Rois par les 7 ». */
export function describeHand(hand: HandValue): string {
  const [first = 0, second = 0] = hand.tiebreakers;
  switch (hand.category) {
    case HandCategory.StraightFlush:
      return first === ACE ? 'Quinte flush royale' : `Quinte flush ${toThe(first)}`;
    case HandCategory.FourOfAKind:
      return `Carré ${ofPlural(first)}`;
    case HandCategory.FullHouse:
      return `Full aux ${plural(first)} par les ${plural(second)}`;
    case HandCategory.Flush:
      return `Couleur ${toThe(first)}`;
    case HandCategory.Straight:
      return `Quinte ${toThe(first)}`;
    case HandCategory.ThreeOfAKind:
      return `Brelan ${ofPlural(first)}`;
    case HandCategory.TwoPair:
      return `Double paire, ${plural(first)} et ${plural(second)}`;
    case HandCategory.Pair:
      return `Paire ${ofPlural(first)}`;
    case HandCategory.HighCard:
      return `Hauteur ${rankName(first)}`;
  }
}

/** Valeurs triées de façon décroissante et sans doublon → carte haute de la quinte, sinon null. */
function findStraightHigh(values: readonly number[]): number | null {
  if (values.length !== 5) return null;
  const [high = 0, , , , low = 0] = values;
  if (high - low === 4) return high;
  if (values.join() === [ACE, 5, 4, 3, 2].join()) return 5;
  return null;
}

/**
 * Encode catégorie + départages dans un seul nombre, comme les chiffres d'un nombre en base 15
 * (les rangs vont de 2 à 14) : la catégorie est le chiffre de poids fort, puis chaque départage.
 * Comparer deux mains revient alors à comparer deux nombres.
 */
function computeScore(category: HandCategory, tiebreakers: readonly number[]): number {
  let score: number = category;
  for (let i = 0; i < 5; i++) score = score * 15 + (tiebreakers[i] ?? 0);
  return score;
}

function* combinations<T>(items: readonly T[], size: number): Generator<T[]> {
  const picked: T[] = [];
  function* pick(start: number): Generator<T[]> {
    if (picked.length === size) {
      yield [...picked];
      return;
    }
    for (let i = start; i <= items.length - (size - picked.length); i++) {
      picked.push(items[i] as T);
      yield* pick(i + 1);
      picked.pop();
    }
  }
  yield* pick(0);
}

const RANK_NAMES: Record<number, [singular: string, plural: string]> = {
  11: ['Valet', 'Valets'],
  12: ['Dame', 'Dames'],
  13: ['Roi', 'Rois'],
  14: ['As', 'As'],
};

function rankName(value: number): string {
  return RANK_NAMES[value]?.[0] ?? String(value);
}

function plural(value: number): string {
  return RANK_NAMES[value]?.[1] ?? String(value);
}

/** « de Rois », « d'As » */
function ofPlural(value: number): string {
  return value === ACE ? "d'As" : `de ${plural(value)}`;
}

/** « au Roi », « à la Dame », « à l'As » */
function toThe(value: number): string {
  if (value === ACE) return "à l'As";
  if (value === 12) return 'à la Dame';
  return `au ${rankName(value)}`;
}
