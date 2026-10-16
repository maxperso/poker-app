import { describe, expect, test } from 'vitest';
import {
  applyAction,
  collectedPots,
  defaultAction,
  type HandEvent,
  type HandState,
  legalActions,
  type LegalActions,
  type PlayerAction,
  type RandomInt,
  startHand,
} from '../src';
import { play, seededRandomInt, setup, stacksOf } from './helpers';

const types = (events: HandEvent[]) => events.map((e) => e.type);
const legal = (hand: HandState) => legalActions(hand) as LegalActions;

describe('startHand', () => {
  test('3 joueurs : blinds, distribution, parole au bouton (UTG à 3)', () => {
    const { hand, events } = setup({ stacks: [1000, 1000, 1000], button: 0 });
    expect([hand.smallBlindSeat, hand.bigBlindSeat]).toEqual([1, 2]);
    expect(stacksOf(hand)).toEqual({ 0: 1000, 1: 990, 2: 980 });
    expect(hand.toAct).toBe(0);
    expect(hand.currentBet).toBe(20);
    expect(types(events)).toEqual(['handStarted', 'blindPosted', 'blindPosted', 'holeCardsDealt']);

    const dealt = hand.players.flatMap((p) => p.holeCards);
    expect(new Set([...dealt, ...hand.deck]).size).toBe(52);
    expect(hand.deck).toHaveLength(46);
  });

  test('heads-up : le bouton est petite blind et parle en premier', () => {
    const { hand } = setup({ stacks: [1000, 1000], button: 0 });
    expect([hand.smallBlindSeat, hand.bigBlindSeat, hand.toAct]).toEqual([0, 1, 0]);
  });

  test('sièges vides : les positions sautent les trous', () => {
    const { hand } = setup({ stacks: [1000, null, 1000, null, 1000, 1000], button: 4 });
    expect([hand.smallBlindSeat, hand.bigBlindSeat, hand.toAct]).toEqual([5, 0, 2]);
  });

  test('les cartes sont distribuées une par une à partir de la gauche du bouton', () => {
    const { hand } = setup({ stacks: [1000, 1000, 1000], button: 0, holes: { 1: 'AS KS' } });
    expect(hand.players[1]?.holeCards).toEqual(['AS', 'KS']);
  });

  test('refuse une configuration impossible', () => {
    const blinds = { small: 10, big: 20 };
    const rng = seededRandomInt(1);
    const p = (seat: number, stack = 100) => ({ seat, id: `p${seat}`, stack });
    expect(() =>
      startHand({ handNumber: 1, participants: [p(0)], buttonSeat: 0, blinds }, rng),
    ).toThrow();
    expect(() =>
      startHand({ handNumber: 1, participants: [p(0), p(1)], buttonSeat: 5, blinds }, rng),
    ).toThrow();
    expect(() =>
      startHand({ handNumber: 1, participants: [p(0), p(1, 0)], buttonSeat: 0, blinds }, rng),
    ).toThrow();
  });
});

describe('enchères', () => {
  test('tout le monde se couche : la grosse blind gagne sans montrer', () => {
    const { hand, events } = play(
      setup({ stacks: [1000, 1000, 1000], button: 0 }).hand,
      [0, 'fold'],
      [1, 'fold'],
    );
    expect(hand.isComplete).toBe(true);
    expect(stacksOf(hand)).toEqual({ 0: 1000, 1: 990, 2: 1010 });
    expect(events).toContainEqual({ type: 'uncalledBetReturned', seat: 2, amount: 10 });
    expect(events).toContainEqual({
      type: 'potAwarded',
      potIndex: 0,
      amount: 20,
      winners: [{ seat: 2, amount: 20 }],
    });
    expect(types(events)).not.toContain('cardsRevealed');
    expect(hand.result?.showdown).toEqual([]);
    expect(hand.players.every((p) => !p.revealed)).toBe(true);
  });

  test("option de la grosse blind : elle peut parler ou relancer quand on l'a seulement suivie", () => {
    const { hand } = play(
      setup({ stacks: [1000, 1000, 1000], button: 0 }).hand,
      [0, 'call'],
      [1, 'call'],
    );
    expect(hand.toAct).toBe(2);
    expect(legal(hand)).toEqual({
      seat: 2,
      canCheck: true,
      callAmount: 0,
      raise: { min: 40, max: 1000 },
    });
  });

  test('relance minimale : au moins la taille de la relance précédente', () => {
    const { hand } = play(setup({ stacks: [1000, 1000, 1000], button: 0 }).hand, [0, 60]);
    // 60 = relance de 40 au-dessus de 20 → la prochaine doit monter à 60 + 40 = 100.
    expect(legal(hand).raise).toEqual({ min: 100, max: 1000 });
    expect(applyAction(hand, 1, { type: 'raise', to: 99 })).toEqual({
      ok: false,
      error: 'INVALID_AMOUNT',
    });
    expect(applyAction(hand, 1, { type: 'raise', to: 100 }).ok).toBe(true);
  });

  test('mise après le flop : minimum une grosse blind', () => {
    const { hand } = play(
      setup({ stacks: [1000, 1000], button: 0 }).hand,
      [0, 'call'],
      [1, 'check'],
    );
    expect(hand.street).toBe('flop');
    expect(legal(hand).raise).toEqual({ min: 20, max: 980 });
    const { events } = play(hand, [1, 50]);
    expect(events[0]).toEqual({
      type: 'playerActed',
      seat: 1,
      action: 'bet',
      amount: 50,
      allIn: false,
    });
  });

  test.each<[string, PlayerAction, string]>([
    ['plus que son tapis', { type: 'raise', to: 1001 }, 'INVALID_AMOUNT'],
    ['montant non entier', { type: 'raise', to: 50.5 }, 'INVALID_AMOUNT'],
    ['parole face à une mise', { type: 'check' }, 'CANNOT_CHECK'],
  ])('refuse : %s', (_label, action, error) => {
    const { hand } = setup({ stacks: [1000, 1000, 1000], button: 0 });
    expect(applyAction(hand, 0, action)).toEqual({ ok: false, error });
  });

  test('refuse : suivre alors que rien n’est à suivre', () => {
    const { hand } = play(
      setup({ stacks: [1000, 1000, 1000], button: 0 }).hand,
      [0, 'call'],
      [1, 'call'],
    );
    expect(applyAction(hand, 2, { type: 'call' })).toEqual({ ok: false, error: 'NOTHING_TO_CALL' });
  });

  test('refuse : jouer hors de son tour, ou après la fin de la main', () => {
    const { hand } = setup({ stacks: [1000, 1000, 1000], button: 0 });
    expect(applyAction(hand, 1, { type: 'fold' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    const done = play(hand, [0, 'fold'], [1, 'fold']).hand;
    expect(applyAction(done, 2, { type: 'check' })).toEqual({ ok: false, error: 'HAND_COMPLETE' });
  });

  test('tapis inférieur à la relance minimale : autorisé', () => {
    const { hand } = play(setup({ stacks: [1000, 150, 1000], button: 0 }).hand, [0, 100]);
    expect(legal(hand).raise).toEqual({ min: 150, max: 150 });
    const after = play(hand, [1, 'allIn']).hand;
    expect(after.currentBet).toBe(150);
    expect(after.minRaise).toBe(80); // inchangé : ce n'était pas une relance complète
  });

  test('un tapis incomplet ne rouvre pas les enchères pour qui a déjà parlé', () => {
    // 0 relance à 100 ; 1 fait tapis à 140 (une relance complète demanderait 180).
    const start = setup({ stacks: [1000, 140, 1000], button: 0 }).hand;
    const { hand } = play(start, [0, 100], [1, 'allIn']);
    // La grosse blind n'a pas encore parlé : elle peut relancer.
    expect(legal(hand).raise).not.toBeNull();
    const back = play(hand, [2, 'call']).hand;
    expect(back.toAct).toBe(0);
    expect(legal(back)).toEqual({ seat: 0, canCheck: false, callAmount: 40, raise: null });
    expect(applyAction(back, 0, { type: 'raise', to: 300 })).toEqual({
      ok: false,
      error: 'CANNOT_RAISE',
    });
  });

  test('un tapis qui vaut une relance complète rouvre les enchères', () => {
    // 3 relance à 100, 0 suit, 1 fait tapis à 300 (relance complète de 200), 2 se couche.
    const start = setup({ stacks: [1000, 300, 1000, 1000], button: 0 }).hand;
    const { hand } = play(start, [3, 100], [0, 'call'], [1, 'allIn'], [2, 'fold']);
    expect(hand.toAct).toBe(3);
    expect(legal(hand).raise).toEqual({ min: 500, max: 1000 });
  });

  test('pas de relance quand tous les autres sont à tapis', () => {
    const { hand } = play(
      setup({ stacks: [1000, 1000, 300], button: 0 }).hand,
      [0, 'fold'],
      [1, 'call'],
      [2, 'allIn'],
    );
    expect(legal(hand)).toEqual({ seat: 1, canCheck: false, callAmount: 280, raise: null });
  });

  test('grosse blind à tapis pour moins que la blind : les autres suivent quand même 20', () => {
    const start = setup({ stacks: [1000, 1000, 15], button: 0 }).hand;
    expect(legal(start).callAmount).toBe(20);
    const { hand, events } = play(start, [0, 'call'], [1, 'call']);
    // La grosse blind (15 jetons) a tout posté et n'a plus rien à jouer.
    expect(stacksOf(hand)[2]).toBe(0);
    expect(hand.street).toBe('flop');
    expect(events.filter((e) => e.type === 'playerActed')).toHaveLength(2);
  });
});

test('« tapis » qui ne couvre pas la mise en cours : c’est un suivi', () => {
  const start = setup({ stacks: [1000, 1000, 1000], button: 0 }).hand;
  const { hand } = play(start, [0, 500], [1, 'fold']);
  const short = {
    ...hand,
    players: hand.players.map((p) => (p.seat === 2 ? { ...p, stack: 100 } : p)),
  };
  const { events } = play(short, [2, 'allIn']);
  expect(events[0]).toEqual({
    type: 'playerActed',
    seat: 2,
    action: 'call',
    amount: 120,
    allIn: true,
  });
});

describe('déroulé de la main', () => {
  const board = '2C 7D 9H JC 3S';

  test("parole jusqu'à la river, puis abattage", () => {
    const start = setup({
      stacks: [1000, 1000],
      button: 0,
      holes: { 0: 'AS AD', 1: 'KS KD' },
      board,
    }).hand;
    const { hand, events } = play(
      start,
      [0, 'call'],
      [1, 'check'],
      // Heads-up : après le flop, la grosse blind parle en premier.
      [1, 'check'],
      [0, 'check'],
      [1, 'check'],
      [0, 'check'],
      [1, 'check'],
      [0, 'check'],
    );
    expect(hand.isComplete).toBe(true);
    expect(hand.board.join(' ')).toBe(board);
    expect(stacksOf(hand)).toEqual({ 0: 1020, 1: 980 });
    expect(events.filter((e) => e.type === 'boardDealt').map((e) => e.cards.length)).toEqual([
      3, 1, 1,
    ]);
    expect(hand.result?.showdown.map((s) => s.name)).toEqual(["Paire d'As", 'Paire de Rois']);
    expect(hand.players.every((p) => p.revealed)).toBe(true);
    expect(types(events).slice(-5)).toEqual([
      'betsCollected',
      'cardsRevealed',
      'showdown',
      'potAwarded',
      'handEnded',
    ]);
  });

  test('après le flop, la parole est au premier joueur actif à gauche du bouton', () => {
    const start = setup({ stacks: [1000, 1000, 1000, 1000], button: 0 }).hand;
    const { hand } = play(start, [3, 'call'], [0, 'call'], [1, 'fold'], [2, 'check']);
    expect(hand.street).toBe('flop');
    expect(hand.toAct).toBe(2); // la petite blind (siège 1) s'est couchée
  });

  test('tapis et suivi avant le flop : cartes montrées puis board déroulé', () => {
    const start = setup({
      stacks: [1000, 1000],
      button: 0,
      holes: { 0: 'AS AD', 1: 'KS KD' },
      board,
    }).hand;
    const { hand, events } = play(start, [0, 'allIn'], [1, 'call']);
    expect(hand.isComplete).toBe(true);
    expect(hand.board).toHaveLength(5);
    expect(stacksOf(hand)).toEqual({ 0: 2000, 1: 0 });
    const order = types(events);
    expect(order.indexOf('cardsRevealed')).toBeLessThan(order.indexOf('boardDealt'));
  });

  test('side pots : le tapis court gagne le principal, le deuxième le side pot', () => {
    const start = setup({
      stacks: [50, 200, 200],
      button: 0,
      holes: { 0: 'AS AD', 1: 'KS KD', 2: 'QS QD' },
      board,
    }).hand;
    const { hand, events } = play(start, [0, 'allIn'], [1, 'allIn'], [2, 'call']);
    expect(events.find((e) => e.type === 'betsCollected')).toEqual({
      type: 'betsCollected',
      pots: [
        { amount: 150, eligibleSeats: [0, 1, 2] },
        { amount: 300, eligibleSeats: [1, 2] },
      ],
    });
    expect(stacksOf(hand)).toEqual({ 0: 150, 1: 300, 2: 0 });
  });

  test('égalité : le board joue, pot partagé', () => {
    const start = setup({
      stacks: [1000, 1000],
      button: 0,
      holes: { 0: '2C 3D', 1: '4H 5S' },
      board: 'AS KD QH JC TS',
    }).hand;
    const { hand } = play(
      start,
      [0, 'call'],
      [1, 'check'],
      [1, 'check'],
      [0, 'check'],
      [1, 'check'],
      [0, 'check'],
      [1, 'check'],
      [0, 'check'],
    );
    expect(stacksOf(hand)).toEqual({ 0: 1000, 1: 1000 });
  });

  test('égalité avec jeton impair : au premier gagnant à gauche du bouton', () => {
    // Blinds 5/10 : le bouton suit (10), la petite blind se couche (5 morts) → pot de 25.
    const start = setup({
      stacks: [1000, 1000, 1000],
      button: 0,
      blinds: { small: 5, big: 10 },
      holes: { 0: '2C 3D', 2: '4H 5S' },
      board: 'AS KD QH JC TS',
    }).hand;
    const { hand } = play(
      start,
      [0, 'call'],
      [1, 'fold'],
      [2, 'check'],
      [2, 'check'],
      [0, 'check'],
      [2, 'check'],
      [0, 'check'],
      [2, 'check'],
      [0, 'check'],
    );
    // Ordre depuis la gauche du bouton : 1, 2, 0 → le siège 2 prend le jeton impair.
    expect(hand.result?.awards[0]?.winners).toEqual([
      { seat: 2, amount: 13 },
      { seat: 0, amount: 12 },
    ]);
  });

  test('petite blind à tapis en postant : la main se joue toute seule', () => {
    const { hand, events } = setup({ stacks: [5, 1000], button: 0 });
    expect(hand.isComplete).toBe(true);
    expect(events).toContainEqual({ type: 'uncalledBetReturned', seat: 1, amount: 15 });
    expect(stacksOf(hand)[0]! + stacksOf(hand)[1]!).toBe(1005);
  });

  test('collectedPots : seulement ce qui a été ramassé au centre', () => {
    const { hand } = play(
      setup({ stacks: [1000, 1000, 1000], button: 0 }).hand,
      [0, 'call'],
      [1, 'call'],
      [2, 'check'],
    );
    expect(collectedPots(hand)).toEqual([{ amount: 60, eligibleSeats: [0, 1, 2] }]);
    const { hand: withBet } = play(hand, [1, 40]);
    expect(collectedPots(withBet)).toEqual([{ amount: 60, eligibleSeats: [0, 1, 2] }]);
  });

  test('defaultAction (temps écoulé) : parole si possible, sinon se coucher', () => {
    const { hand } = setup({ stacks: [1000, 1000, 1000], button: 0 });
    expect(defaultAction(hand)).toEqual({ type: 'fold' });
    const { hand: option } = play(hand, [0, 'call'], [1, 'call']);
    expect(defaultAction(option)).toEqual({ type: 'check' });
  });
});

test('propriété : 1 000 mains jouées au hasard se terminent sans créer ni perdre de jeton', () => {
  const rng = seededRandomInt(99);
  for (let run = 0; run < 1_000; run++) {
    const count = 2 + rng(8);
    const participants = Array.from({ length: count }, (_, seat) => ({
      seat,
      id: `p${seat}`,
      stack: 1 + rng(400),
    }));
    const total = participants.reduce((sum, p) => sum + p.stack, 0);
    let { hand } = startHand(
      { handNumber: run, participants, buttonSeat: rng(count), blinds: { small: 5, big: 10 } },
      rng,
    );

    for (let steps = 0; !hand.isComplete; steps++) {
      expect(steps).toBeLessThan(200);
      const options = legal(hand);
      const outcome = applyAction(hand, options.seat, randomLegalAction(options, rng));
      if (!outcome.ok) throw new Error(`Action légale refusée : ${outcome.error}`);
      hand = outcome.hand;
      const inPlay = hand.players.reduce((sum, p) => sum + p.stack + p.totalBet, 0);
      if (!hand.isComplete) expect(inPlay).toBe(total);
    }

    expect(hand.players.reduce((sum, p) => sum + p.stack, 0)).toBe(total);
    expect(hand.players.every((p) => p.stack >= 0)).toBe(true);
    const seen = [...hand.players.flatMap((p) => p.holeCards), ...hand.board];
    expect(new Set(seen).size).toBe(seen.length);
  }
});

function randomLegalAction(options: LegalActions, rng: RandomInt): PlayerAction {
  const choices: PlayerAction[] = [{ type: 'fold' }];
  if (options.canCheck) choices.push({ type: 'check' }, { type: 'check' });
  if (options.callAmount > 0) choices.push({ type: 'call' }, { type: 'call' });
  if (options.raise) {
    const { min, max } = options.raise;
    choices.push({ type: 'raise', to: min + rng(max - min + 1) }, { type: 'allIn' });
  }
  return choices[rng(choices.length)] as PlayerAction;
}
