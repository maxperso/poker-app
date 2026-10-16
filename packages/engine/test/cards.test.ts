import { describe, expect, test } from 'vitest';
import { createDeck, isCard, parseCards, rankValue, shuffle, type RandomInt } from '../src';
import { seededRandomInt } from './helpers';

describe('createDeck', () => {
  test('contient 52 cartes distinctes et valides', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
    expect(deck.every(isCard)).toBe(true);
  });
});

describe('parseCards', () => {
  test('lit une liste séparée par des espaces', () => {
    expect(parseCards(' AS  KD\tTH ')).toEqual(['AS', 'KD', 'TH']);
  });

  test.each(['1S', 'AX', '10H', 'as'])('rejette "%s"', (text) => {
    expect(() => parseCards(text)).toThrow('Carte invalide');
  });
});

test('rankValue va de 2 à 14 (As)', () => {
  expect(rankValue('2')).toBe(2);
  expect(rankValue('T')).toBe(10);
  expect(rankValue('A')).toBe(14);
});

describe('shuffle', () => {
  test('renvoie une permutation sans modifier le tableau reçu', () => {
    const deck = createDeck();
    const copy = [...deck];
    const shuffled = shuffle(deck, seededRandomInt(1));
    expect(deck).toEqual(copy);
    expect(shuffled).not.toEqual(deck);
    expect([...shuffled].sort()).toEqual([...deck].sort());
  });

  test('est déterministe pour une même source de hasard', () => {
    expect(shuffle(createDeck(), seededRandomInt(42))).toEqual(
      shuffle(createDeck(), seededRandomInt(42)),
    );
  });

  test('demande randomInt(n), randomInt(n-1)... randomInt(2) : le contrat de crypto.randomInt', () => {
    const calls: number[] = [];
    const recordingRandomInt: RandomInt = (max) => {
      calls.push(max);
      return 0;
    };
    shuffle(['a', 'b', 'c', 'd'], recordingRandomInt);
    expect(calls).toEqual([4, 3, 2]);
  });

  test('refuse une source de hasard qui sort de l’intervalle', () => {
    expect(() => shuffle(['a', 'b'], () => 2)).toThrow('hors de');
  });

  test('chaque permutation est équiprobable', () => {
    const counts = new Map<string, number>();
    const randomInt = seededRandomInt(7);
    const runs = 60_000;
    for (let i = 0; i < runs; i++) {
      const key = shuffle(['a', 'b', 'c'], randomInt).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // 6 permutations possibles, ~10 000 chacune ; ±5 % laisse plus de 5 écarts-types de marge.
    expect(counts.size).toBe(6);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan((runs / 6) * 0.95);
      expect(count).toBeLessThan((runs / 6) * 1.05);
    }
  });
});
