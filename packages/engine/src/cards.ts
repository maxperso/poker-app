export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['C', 'D', 'H', 'S'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
// 'AS', 'TD'... : même nom que les fichiers SVG du client.
export type Card = `${Rank}${Suit}`;

/**
 * Source de hasard injectée : renvoie un entier dans [0, maxExclusive).
 * Même signature que `crypto.randomInt(max)`, que le serveur passera tel quel.
 */
export type RandomInt = (maxExclusive: number) => number;

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

/** Valeur numérique d'un rang : 2 → 2, ..., T → 10, J → 11, Q → 12, K → 13, A → 14. */
export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank) + 2;
}

export function isCard(value: string): value is Card {
  return (
    value.length === 2 &&
    (RANKS as readonly string[]).includes(value[0] ?? '') &&
    (SUITS as readonly string[]).includes(value[1] ?? '')
  );
}

/** `parseCards('AS KD TH')` → ['AS', 'KD', 'TH']. Pratique pour les tests et le debug. */
export function parseCards(text: string): Card[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token !== '')
    .map((token) => {
      if (!isCard(token)) throw new Error(`Carte invalide : "${token}"`);
      return token;
    });
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank): Card => `${rank}${suit}`));
}

/**
 * Mélange de Fisher-Yates : chaque permutation a exactement la même probabilité,
 * à condition que `randomInt` soit uniforme. Renvoie un nouveau tableau.
 *
 * À ne pas faire : `cards.sort(() => Math.random() - 0.5)`, qui est biaisé
 * (certaines permutations sortent nettement plus souvent que d'autres).
 */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new Error(`randomInt(${i + 1}) a renvoyé ${j}, hors de [0, ${i}]`);
    }
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}
