import { describe, expect, test } from 'vitest';
import { awardPots, buildPots, findUncalledBet, type Contribution } from '../src';
import { seededRandomInt } from './helpers';

/** c(0, 100) = siège 0 a mis 100 ; c(1, 50, true) = siège 1 a mis 50 puis s'est couché. */
const c = (seat: number, amount: number, folded = false): Contribution => ({
  seat,
  amount,
  folded,
});

describe('findUncalledBet', () => {
  test('rend au plus gros tapis la part que personne n’a pu suivre', () => {
    expect(findUncalledBet([c(0, 500), c(1, 200)])).toEqual({ seat: 0, amount: 300 });
  });

  test('tout le monde se couche sur une relance : la relance revient au relanceur', () => {
    expect(findUncalledBet([c(0, 60), c(1, 20, true), c(2, 10, true)])).toEqual({
      seat: 0,
      amount: 40,
    });
  });

  test('rien à rendre quand les deux plus grosses mises sont égales', () => {
    expect(findUncalledBet([c(0, 200), c(1, 200), c(2, 50)])).toBeNull();
  });
});

describe('buildPots', () => {
  test('mises égales : un seul pot', () => {
    expect(buildPots([c(0, 100), c(1, 100), c(2, 100)])).toEqual([
      { amount: 300, eligibleSeats: [0, 1, 2] },
    ]);
  });

  test('un joueur couché alimente le pot sans pouvoir le gagner', () => {
    expect(buildPots([c(0, 100), c(1, 100), c(2, 50, true)])).toEqual([
      { amount: 250, eligibleSeats: [0, 1] },
    ]);
  });

  test('un tapis court : pot principal + un side pot', () => {
    expect(buildPots([c(0, 50), c(1, 200), c(2, 200)])).toEqual([
      { amount: 150, eligibleSeats: [0, 1, 2] },
      { amount: 300, eligibleSeats: [1, 2] },
    ]);
  });

  test('trois tapis de tailles différentes : trois niveaux', () => {
    expect(buildPots([c(0, 25), c(1, 75), c(2, 150), c(3, 150)])).toEqual([
      { amount: 100, eligibleSeats: [0, 1, 2, 3] },
      { amount: 150, eligibleSeats: [1, 2, 3] },
      { amount: 150, eligibleSeats: [2, 3] },
    ]);
  });

  test('deux tapis de même montant ne créent qu’un niveau', () => {
    expect(buildPots([c(0, 50), c(1, 50), c(2, 120), c(3, 120)])).toEqual([
      { amount: 200, eligibleSeats: [0, 1, 2, 3] },
      { amount: 140, eligibleSeats: [2, 3] },
    ]);
  });

  test('un joueur couché entre deux niveaux répartit sa mise sur les deux pots', () => {
    // A tapis 50, B se couche après avoir mis 100, C et D vont à 300.
    expect(buildPots([c(0, 50), c(1, 100, true), c(2, 300), c(3, 300)])).toEqual([
      { amount: 200, eligibleSeats: [0, 2, 3] },
      { amount: 550, eligibleSeats: [2, 3] },
    ]);
  });

  test('aucun jeton : aucun pot', () => {
    expect(buildPots([c(0, 0), c(1, 0)])).toEqual([]);
  });
});

describe('awardPots', () => {
  const scores = (entries: [seat: number, score: number][]) => new Map(entries);

  test('le meilleur score prend le pot', () => {
    const awards = awardPots(
      [{ amount: 300, eligibleSeats: [0, 1, 2] }],
      scores([
        [0, 10],
        [1, 30],
        [2, 20],
      ]),
      [1, 2, 0],
    );
    expect(awards).toEqual([{ potIndex: 0, amount: 300, winners: [{ seat: 1, amount: 300 }] }]);
  });

  test('un seul éligible : il gagne sans abattage (pas de score nécessaire)', () => {
    expect(awardPots([{ amount: 90, eligibleSeats: [4] }], new Map(), [4])).toEqual([
      { potIndex: 0, amount: 90, winners: [{ seat: 4, amount: 90 }] },
    ]);
  });

  test('égalité : partage en parts égales', () => {
    const [award] = awardPots(
      [{ amount: 300, eligibleSeats: [0, 1, 2] }],
      scores([
        [0, 50],
        [1, 50],
        [2, 10],
      ]),
      [0, 1, 2],
    );
    expect(award?.winners).toEqual([
      { seat: 0, amount: 150 },
      { seat: 1, amount: 150 },
    ]);
  });

  test('jeton impair : au premier gagnant à gauche du bouton', () => {
    // Bouton en 0 : l'ordre part du siège 1, donc le siège 3 passe avant le 5.
    const [award] = awardPots(
      [{ amount: 101, eligibleSeats: [3, 5] }],
      scores([
        [3, 7],
        [5, 7],
      ]),
      [1, 3, 5],
    );
    expect(award?.winners).toEqual([
      { seat: 3, amount: 51 },
      { seat: 5, amount: 50 },
    ]);
  });

  test('jeton impair : l’ordre suit le bouton, pas le numéro de siège', () => {
    // Bouton en 4 : on part du siège 5, puis on fait le tour (0, 1, 2...).
    const [award] = awardPots(
      [{ amount: 100, eligibleSeats: [0, 2, 5] }],
      scores([
        [0, 1],
        [2, 1],
        [5, 1],
      ]),
      [5, 0, 2],
    );
    expect(award?.winners).toEqual([
      { seat: 5, amount: 34 },
      { seat: 0, amount: 33 },
      { seat: 2, amount: 33 },
    ]);
  });

  test('le tapis court gagne le principal, un autre joueur gagne le side pot', () => {
    const pots = buildPots([c(0, 50), c(1, 200), c(2, 200)]);
    const awards = awardPots(
      pots,
      scores([
        [0, 99],
        [1, 10],
        [2, 20],
      ]),
      [0, 1, 2],
    );
    expect(awards.map((a) => a.winners)).toEqual([
      [{ seat: 0, amount: 150 }],
      [{ seat: 2, amount: 300 }],
    ]);
  });

  test('égalité sur le side pot uniquement', () => {
    const pots = buildPots([c(0, 25), c(1, 75), c(2, 150), c(3, 150)]);
    const awards = awardPots(
      pots,
      scores([
        [0, 100],
        [1, 80],
        [2, 80],
        [3, 5],
      ]),
      [0, 1, 2, 3],
    );
    expect(awards.map((a) => a.winners)).toEqual([
      [{ seat: 0, amount: 100 }],
      [
        { seat: 1, amount: 75 },
        { seat: 2, amount: 75 },
      ],
      [{ seat: 2, amount: 150 }],
    ]);
  });

  test('score manquant pour un éligible : erreur de programmation', () => {
    expect(() => awardPots([{ amount: 10, eligibleSeats: [0, 1] }], new Map(), [0, 1])).toThrow(
      'Score manquant',
    );
  });
});

test('propriété : aucun jeton ne se crée ni ne se perd', () => {
  const randomInt = seededRandomInt(2024);
  for (let run = 0; run < 2_000; run++) {
    const playerCount = 2 + randomInt(8);
    const contributions = Array.from({ length: playerCount }, (_, seat) =>
      c(seat, randomInt(5) * 25 + randomInt(3), randomInt(4) === 0),
    );
    // Comme en vrai : le plus gros contributeur ne s'est pas couché (personne ne l'a relancé).
    const top = contributions.reduce((a, b) => (b.amount > a.amount ? b : a));
    top.folded = false;

    const uncalled = findUncalledBet(contributions);
    const afterRefund = contributions.map((x) =>
      x.seat === uncalled?.seat ? { ...x, amount: x.amount - uncalled.amount } : x,
    );
    const pots = buildPots(afterRefund);
    const scores = new Map(contributions.map((x) => [x.seat, randomInt(3)]));
    const order = contributions.map((x) => x.seat);
    const paid = awardPots(pots, scores, order)
      .flatMap((a) => a.winners)
      .reduce((sum, w) => sum + w.amount, 0);

    const total = contributions.reduce((sum, x) => sum + x.amount, 0);
    expect(paid + (uncalled?.amount ?? 0)).toBe(total);
    for (const pot of pots) expect(pot.eligibleSeats.length).toBeGreaterThan(0);
  }
});
