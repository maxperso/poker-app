import { describe, expect, test } from 'vitest';
import {
  compareHands,
  describeHand,
  evaluateBest,
  evaluateFive,
  HandCategory,
  parseCards,
  type HandValue,
} from '../src';

const five = (text: string): HandValue => evaluateFive(parseCards(text));
const best = (text: string): HandValue => evaluateBest(parseCards(text));

describe('evaluateFive : reconnaît chaque catégorie', () => {
  test.each([
    ['AS KS QS JS TS', 'Quinte flush royale', HandCategory.StraightFlush],
    ['9H 8H 7H 6H 5H', 'Quinte flush au 9', HandCategory.StraightFlush],
    ['5D 4D 3D 2D AD', 'Quinte flush au 5', HandCategory.StraightFlush],
    ['QC QD QH QS 3C', 'Carré de Dames', HandCategory.FourOfAKind],
    ['KC KD KH 7S 7C', 'Full aux Rois par les 7', HandCategory.FullHouse],
    ['AH JH 8H 4H 2H', "Couleur à l'As", HandCategory.Flush],
    ['TC 9D 8H 7S 6C', 'Quinte au 10', HandCategory.Straight],
    ['AC 2D 3H 4S 5C', 'Quinte au 5', HandCategory.Straight],
    ['QC JD TH 9S 8C', 'Quinte à la Dame', HandCategory.Straight],
    ['7C 7D 7H KS 2C', 'Brelan de 7', HandCategory.ThreeOfAKind],
    ['JC JD 4H 4S AC', 'Double paire, Valets et 4', HandCategory.TwoPair],
    ['AC AD 9H 5S 2C', "Paire d'As", HandCategory.Pair],
    ['KC JD 8H 5S 3C', 'Hauteur Roi', HandCategory.HighCard],
  ])('%s → %s', (text, name, category) => {
    const hand = five(text);
    expect(hand.category).toBe(category);
    expect(describeHand(hand)).toBe(name);
  });

  test("pas de quinte « qui tourne » : Q-K-A-2-3 n'est qu'une hauteur As", () => {
    expect(five('QC KD AH 2S 3C').category).toBe(HandCategory.HighCard);
  });

  test('ordonne les cartes par importance (pour les surligner)', () => {
    expect(five('7S KC 7C KD KH').cards).toEqual(['KC', 'KD', 'KH', '7S', '7C']);
    expect(five('3H AC 5C 2D 4S').cards).toEqual(['5C', '4S', '3H', '2D', 'AC']);
  });

  test('refuse un nombre de cartes différent de 5', () => {
    expect(() => evaluateFive(parseCards('AS KS QS JS'))).toThrow();
  });
});

describe('compareHands : hiérarchie des catégories', () => {
  const ladder = [
    'AS KS QS JS TS', // quinte flush
    '2C 2D 2H 2S 3C', // carré
    '3C 3D 3H 2S 2C', // full
    '7H 5H 4H 3H 2H', // couleur
    'AC 2D 3H 4S 5C', // quinte (la plus petite)
    'AC AD AH KS QC', // brelan
    'AC AD KH KS QC', // double paire
    'AC AD KH QS JC', // paire
    'AC KD QH JS 9C', // hauteur
  ];

  test.each(ladder.slice(0, -1).map((stronger, i) => [stronger, ladder[i + 1] as string]))(
    '%s bat %s',
    (stronger, weaker) => {
      expect(compareHands(five(stronger), five(weaker))).toBeGreaterThan(0);
      expect(compareHands(five(weaker), five(stronger))).toBeLessThan(0);
    },
  );
});

describe('compareHands : départage à catégorie égale', () => {
  test.each([
    ['paire : le kicker décide', 'KC KD AH 5S 2C', 'KH KS QH JS TC'],
    ['paire : jusqu’au 3e kicker', 'KC KD AH 9S 4C', 'KH KS AD 9C 3S'],
    ['double paire : la 2e paire', 'JC JD 9H 9S 2C', 'JH JS 8C 8D AC'],
    ['double paire : le kicker', 'JC JD 4H 4S AC', 'JH JS 4C 4D KC'],
    ['hauteur : jusqu’à la 5e carte', 'AC KD 9H 7S 4C', 'AD KH 9C 7D 3S'],
    ['couleur : jusqu’à la 5e carte', 'AH JH 8H 4H 3H', 'AS JS 8S 4S 2S'],
    ['full : le brelan avant la paire', '3C 3D 3H 2S 2C', '2D 2H 2S AC AD'],
    ['carré : le kicker', '9C 9D 9H 9S KC', '9C 9D 9H 9S QC'],
    ['quinte : 6-haut bat la roue', '2C 3D 4H 5S 6C', 'AC 2D 3H 4S 5C'],
    ["quinte : à l'As bat au Roi", 'AC KD QH JS TC', 'KC QD JH TS 9C'],
    ['quinte flush : la plus haute', '6H 5H 4H 3H 2H', '5S 4S 3S 2S AS'],
  ])('%s', (_label, stronger, weaker) => {
    expect(compareHands(five(stronger), five(weaker))).toBeGreaterThan(0);
  });

  test('mêmes rangs, couleurs différentes : égalité parfaite', () => {
    expect(compareHands(five('AC KD 9H 7S 4C'), five('AD KH 9C 7D 4S'))).toBe(0);
    expect(compareHands(five('TC 9D 8H 7S 6C'), five('TD 9C 8S 7H 6D'))).toBe(0);
  });
});

describe('evaluateBest : meilleure main parmi 7 cartes', () => {
  test('retient exactement 5 cartes', () => {
    const hand = best('AC AD 9H 5S 2C KD 7H');
    expect(hand.category).toBe(HandCategory.Pair);
    expect(hand.cards).toEqual(['AC', 'AD', 'KD', '9H', '7H']);
  });

  test('trois paires : garde les deux meilleures et le meilleur kicker', () => {
    const hand = best('AC AD KH KS QC QD 2S');
    expect(describeHand(hand)).toBe('Double paire, As et Rois');
    expect(hand.tiebreakers).toEqual([14, 13, 12]);
  });

  test('deux brelans font un full', () => {
    expect(describeHand(best('9C 9D 9H 5S 5C 5D 2H'))).toBe('Full aux 9 par les 5');
  });

  test('six cartes consécutives : la quinte la plus haute', () => {
    expect(describeHand(best('4C 5D 6H 7S 8C 9D KH'))).toBe('Quinte au 9');
  });

  test('la quinte flush passe devant la couleur', () => {
    expect(describeHand(best('2H 3H 4H 5H 6H 9H KH'))).toBe('Quinte flush au 6');
  });

  test('roue avec un As parmi 7 cartes', () => {
    expect(describeHand(best('AC 2D 3H 4S 5C KD QH'))).toBe('Quinte au 5');
  });

  test('carré : le meilleur kicker parmi les cartes restantes', () => {
    expect(best('7C 7D 7H 7S 2C 3D KH').tiebreakers).toEqual([7, 13]);
  });

  test('le board joue : égalité entre deux joueurs', () => {
    const board = 'AS KD QH JC TS';
    expect(compareHands(best(`${board} 2C 3D`), best(`${board} 4H 5S`))).toBe(0);
  });

  test('couleur au board : la carte privée plus haute dans la couleur gagne', () => {
    const board = 'AH 9H 7H 4H 2H';
    const withKing = best(`${board} KH 3C`);
    const withFive = best(`${board} 5H 6C`);
    const boardOnly = best(`${board} QC JC`);
    expect(compareHands(withKing, withFive)).toBeGreaterThan(0);
    expect(compareHands(withFive, boardOnly)).toBeGreaterThan(0);
  });

  test('kicker sur le board : égalité si les deux kickers sont plus faibles que le board', () => {
    const board = 'KC KD AH QS JC';
    expect(compareHands(best(`${board} 2C 3D`), best(`${board} 4H 5S`))).toBe(0);
  });

  test('accepte 5 et 6 cartes', () => {
    expect(best('AC AD 9H 5S 2C').category).toBe(HandCategory.Pair);
    expect(best('AC AD 9H 5S 2C 9D').category).toBe(HandCategory.TwoPair);
  });

  test.each(['AC AD 9H 5S', 'AC AD 9H 5S 2C KD 7H 8H'])('refuse %s', (text) => {
    expect(() => best(text)).toThrow('5 à 7 cartes');
  });

  test('refuse les cartes en double', () => {
    expect(() => best('AC AC 9H 5S 2C')).toThrow('double');
  });
});
