import {
  applyAction,
  type Blinds,
  type Card,
  createDeck,
  type HandEvent,
  type HandState,
  parseCards,
  type PlayerAction,
  type RandomInt,
  startHand,
} from '../src';

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32) : même graine → même suite.
 * Uniquement pour les tests ; en prod le serveur injecte crypto.randomInt.
 */
export function seededRandomInt(seed: number): RandomInt {
  let state = seed >>> 0;
  return (maxExclusive) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}

/**
 * Source de « hasard » qui fait sortir du mélange un paquet commençant par `topCards`
 * (le reste dans l'ordre par défaut). On rejoue Fisher-Yates à l'envers : à chaque étape,
 * on choisit l'indice qui amène la carte voulue à sa place. Le moteur n'a ainsi besoin
 * d'aucune porte dérobée pour les tests.
 */
export function riggedRandomInt(topCards: readonly Card[]): RandomInt {
  const desired = [...topCards, ...createDeck().filter((c) => !topCards.includes(c))];
  const working = createDeck();
  const choices: number[] = [];
  for (let i = working.length - 1; i > 0; i--) {
    const j = working.indexOf(desired[i] as Card);
    choices.push(j);
    [working[i], working[j]] = [working[j] as Card, working[i] as Card];
  }
  let call = 0;
  return () => choices[call++] as number;
}

export interface SetupOptions {
  /** Tapis par siège ; null = siège vide. */
  stacks: (number | null)[];
  button?: number;
  blinds?: Blinds;
  /** Cartes privées par siège, ex. { 0: 'AS AD' }. Les sièges non précisés reçoivent des cartes quelconques. */
  holes?: Record<number, string>;
  /** Les 5 cartes du board, dans l'ordre flop-turn-river. */
  board?: string;
}

export const BLINDS: Blinds = { small: 10, big: 20 };

/** Démarre une main avec des cartes choisies. Les joueurs s'appellent p0, p1... selon leur siège. */
export function setup(options: SetupOptions): { hand: HandState; events: HandEvent[] } {
  const { stacks, button = firstSeat(stacks), blinds = BLINDS, holes = {}, board } = options;
  const participants = stacks.flatMap((stack, seat) =>
    stack === null ? [] : [{ seat, id: `p${seat}`, stack }],
  );
  const seats = participants.map((p) => p.seat);
  const dealOrder = [...seats.filter((s) => s > button), ...seats.filter((s) => s <= button)];

  const wanted = [...Object.values(holes).flatMap(parseCards), ...(board ? parseCards(board) : [])];
  const spare = createDeck().filter((c) => !wanted.includes(c));
  const take = () => spare.shift() as Card;
  const holeOf = (seat: number) => (holes[seat] ? parseCards(holes[seat]) : [take(), take()]);
  const dealtHoles = new Map(dealOrder.map((seat) => [seat, holeOf(seat)]));

  // Ordre réel de distribution : une carte à chacun, deux fois, puis brûle + flop, brûle + turn, brûle + river.
  const top: Card[] = [
    ...dealOrder.map((seat) => dealtHoles.get(seat)?.[0] as Card),
    ...dealOrder.map((seat) => dealtHoles.get(seat)?.[1] as Card),
  ];
  if (board) {
    const [f1, f2, f3, turn, river] = parseCards(board) as Card[];
    top.push(take(), f1!, f2!, f3!, take(), turn!, take(), river!);
  }

  return startHand(
    { handNumber: 1, participants, buttonSeat: button, blinds },
    riggedRandomInt(top),
  );
}

/** Raccourci d'action : 'fold', 'check', 'call', 'allIn' ou un nombre (relance à). */
export type Step = [seat: number, action: 'fold' | 'check' | 'call' | 'allIn' | number];

export function toAction(action: Step[1]): PlayerAction {
  return typeof action === 'number' ? { type: 'raise', to: action } : { type: action };
}

/** Joue une suite d'actions ; échoue au premier refus, en indiquant lequel. */
export function play(start: HandState, ...steps: Step[]): { hand: HandState; events: HandEvent[] } {
  let hand = start;
  const events: HandEvent[] = [];
  for (const [seat, action] of steps) {
    const outcome = applyAction(hand, seat, toAction(action));
    if (!outcome.ok) throw new Error(`Siège ${seat}, ${String(action)} refusé : ${outcome.error}`);
    hand = outcome.hand;
    events.push(...outcome.events);
  }
  return { hand, events };
}

export function stacksOf(hand: HandState): Record<number, number> {
  return Object.fromEntries(hand.players.map((p) => [p.seat, p.stack]));
}

function firstSeat(stacks: readonly (number | null)[]): number {
  return stacks.findIndex((s) => s !== null);
}
