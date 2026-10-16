import { describe, expect, test } from 'vitest';
import {
  act,
  addChips,
  createTable,
  dealableSeats,
  isInHand,
  type PlayerAction,
  setSittingOut,
  sitDown,
  standUp,
  startNextHand,
  type TableOutcome,
  type TableState,
} from '../src';
import { BLINDS, seededRandomInt } from './helpers';

/** Déballe un résultat qui doit réussir. */
function unwrap(outcome: TableOutcome): TableState {
  if (!outcome.ok) throw new Error(`Refusé : ${outcome.error}`);
  return outcome.table;
}

function seated(seatCount: number, seats: Record<number, number>): TableState {
  let table = createTable(seatCount);
  for (const [seat, stack] of Object.entries(seats)) {
    table = unwrap(sitDown(table, Number(seat), `p${seat}`, stack));
  }
  return table;
}

const rng = () => seededRandomInt(3);
const start = (table: TableState) => unwrap(startNextHand(table, BLINDS, rng()));
const doAct = (table: TableState, seat: number, action: PlayerAction) =>
  unwrap(act(table, seat, action));

/** Tout le monde se couche jusqu'à la fin de la main. */
function foldAround(table: TableState): TableState {
  let current = table;
  while (current.hand && !current.hand.isComplete) {
    current = doAct(current, current.hand.toAct as number, { type: 'fold' });
  }
  return current;
}

describe('sièges', () => {
  test('createTable : 2 à 9 places', () => {
    expect(createTable(6).seats).toHaveLength(6);
    expect(() => createTable(1)).toThrow();
    expect(() => createTable(10)).toThrow();
  });

  test('s’asseoir : siège libre, valide, une seule place par joueur, tapis positif', () => {
    const table = seated(3, { 0: 1000 });
    expect(sitDown(table, 0, 'x', 1000)).toEqual({ ok: false, error: 'SEAT_TAKEN' });
    expect(sitDown(table, 3, 'x', 1000)).toEqual({ ok: false, error: 'INVALID_SEAT' });
    expect(sitDown(table, 1, 'p0', 1000)).toEqual({ ok: false, error: 'ALREADY_SEATED' });
    expect(sitDown(table, 1, 'x', 0)).toEqual({ ok: false, error: 'INVALID_AMOUNT' });
  });

  test('les fonctions ne modifient jamais la table reçue', () => {
    const table = seated(3, { 0: 1000, 1: 1000 });
    const snapshot = structuredCloneJson(table);
    start(table);
    unwrap(standUp(table, 0));
    expect(table).toEqual(snapshot);
  });

  test('quitter son siège : impossible pendant une main où l’on joue', () => {
    const table = start(seated(3, { 0: 1000, 1: 1000 }));
    expect(standUp(table, 0)).toEqual({ ok: false, error: 'IN_HAND' });
    expect(standUp(table, 2)).toEqual({ ok: false, error: 'NOT_SEATED' });
    expect(unwrap(standUp(foldAround(table), 0)).seats[0]).toBeNull();
  });
});

describe('enchaînement des mains', () => {
  test('il faut au moins 2 joueurs servis', () => {
    expect(startNextHand(seated(3, { 0: 1000 }), BLINDS, rng())).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_PLAYERS',
    });
  });

  test('pas de nouvelle main tant que la précédente n’est pas finie', () => {
    const table = start(seated(3, { 0: 1000, 1: 1000 }));
    expect(startNextHand(table, BLINDS, rng())).toEqual({ ok: false, error: 'HAND_IN_PROGRESS' });
  });

  test('le bouton est tiré au sort puis avance au joueur servi suivant', () => {
    let table = seated(6, { 0: 1000, 2: 1000, 5: 1000 });
    table = start(table);
    const first = table.buttonSeat as number;
    expect([0, 2, 5]).toContain(first);

    const seen = [first];
    for (let i = 0; i < 3; i++) {
      table = start(foldAround(table));
      seen.push(table.buttonSeat as number);
    }
    const order = [0, 2, 5];
    const expected = Array.from({ length: 4 }, (_, i) => order[(order.indexOf(first) + i) % 3]);
    expect(seen).toEqual(expected);
    expect(table.handNumber).toBe(4);
  });

  test('un joueur assis pendant une main attend la suivante', () => {
    let table = start(seated(4, { 0: 1000, 1: 1000 }));
    table = unwrap(sitDown(table, 2, 'p2', 1000));
    expect(isInHand(table, 2)).toBe(false);
    expect(table.hand?.players.map((p) => p.seat)).toEqual([0, 1]);

    table = start(foldAround(table));
    expect(table.hand?.players.map((p) => p.seat)).toEqual([0, 1, 2]);
  });

  test('un joueur absent n’est pas servi', () => {
    let table = seated(3, { 0: 1000, 1: 1000, 2: 1000 });
    table = unwrap(setSittingOut(table, 1, true));
    expect(dealableSeats(table)).toEqual([0, 2]);
    expect(start(table).hand?.players.map((p) => p.seat)).toEqual([0, 2]);
  });

  test('les tapis de la table suivent la main, gains compris à la fin', () => {
    let table = start(seated(2, { 0: 1000, 1: 1000 }));
    const { smallBlindSeat, bigBlindSeat } = table.hand!;
    expect(table.seats[smallBlindSeat]?.stack).toBe(990);
    table = doAct(table, smallBlindSeat, { type: 'fold' });
    expect(table.seats[smallBlindSeat]?.stack).toBe(990);
    expect(table.seats[bigBlindSeat]?.stack).toBe(1010);
  });

  test('un joueur sans jetons n’est plus servi ; la recave le remet en jeu', () => {
    let table = start(seated(2, { 0: 1000, 1: 1000 }));
    const sb = table.hand!.smallBlindSeat;
    table = doAct(table, sb, { type: 'allIn' });
    table = doAct(table, table.hand!.toAct as number, { type: 'call' });
    expect(table.hand?.isComplete).toBe(true);

    const busted = table.seats.findIndex((s) => s?.stack === 0);
    expect(busted).not.toBe(-1); // graine fixe : cette main a bien un perdant
    expect(dealableSeats(table)).toHaveLength(1);
    expect(startNextHand(table, BLINDS, rng())).toEqual({ ok: false, error: 'NOT_ENOUGH_PLAYERS' });

    table = unwrap(addChips(table, busted, 1000));
    expect(dealableSeats(table)).toHaveLength(2);
  });

  test('recave impossible pendant une main où l’on joue', () => {
    const table = start(seated(2, { 0: 1000, 1: 1000 }));
    expect(addChips(table, 0, 500)).toEqual({ ok: false, error: 'IN_HAND' });
    expect(addChips(foldAround(table), 0, -5)).toEqual({ ok: false, error: 'INVALID_AMOUNT' });
  });

  test('act sans main en cours, ou action refusée par le moteur', () => {
    const table = seated(2, { 0: 1000, 1: 1000 });
    expect(act(table, 0, { type: 'fold' })).toEqual({ ok: false, error: 'NO_HAND' });
    const playing = start(table);
    const waiting = playing.hand!.toAct === 0 ? 1 : 0;
    expect(act(playing, waiting, { type: 'fold' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });
});

function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
