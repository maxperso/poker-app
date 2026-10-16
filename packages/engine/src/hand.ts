import { type Card, createDeck, type RandomInt, shuffle } from './cards';
import { describeHand, evaluateBest } from './evaluator';
import {
  awardPots,
  buildPots,
  type Contribution,
  findUncalledBet,
  type Pot,
  type PotAward,
} from './pots';

export interface Blinds {
  small: number;
  big: number;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export interface HandParticipant {
  seat: number;
  id: string;
  stack: number;
}

export interface HandPlayer {
  seat: number;
  id: string;
  /** Jetons encore devant le joueur, hors mises en cours. */
  stack: number;
  holeCards: [Card, Card];
  /** Mise sur la rue en cours (les jetons posés devant lui). */
  bet: number;
  /** Total investi dans la main : sert au calcul des side pots. */
  totalBet: number;
  folded: boolean;
  /**
   * Niveau de mise de la rue au moment de sa dernière action, null s'il n'a pas encore parlé.
   * Permet de savoir si une relance complète a eu lieu depuis (et donc s'il peut relancer).
   */
  actedAt: number | null;
  /** Cartes montrées à tous (abattage ou tapis sans action possible). */
  revealed: boolean;
}

export interface ShowdownHand {
  seat: number;
  name: string;
  /** Les 5 cartes de la meilleure main. */
  cards: Card[];
}

export interface HandResult {
  awards: PotAward[];
  /** Vide si la main s'est terminée sans abattage (tout le monde s'est couché). */
  showdown: ShowdownHand[];
}

export interface HandState {
  handNumber: number;
  street: Street;
  isComplete: boolean;
  /** Triés par numéro de siège. */
  players: HandPlayer[];
  buttonSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  blinds: Blinds;
  /** Cartes restantes : ne doit jamais quitter le serveur. */
  deck: Card[];
  board: Card[];
  toAct: number | null;
  /** Mise la plus haute de la rue. */
  currentBet: number;
  /** Incrément minimal d'une relance (taille de la dernière relance complète). */
  minRaise: number;
  /** Niveau atteint par la dernière relance complète de la rue. */
  fullRaiseAt: number;
  result: HandResult | null;
}

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** `to` = montant total de la mise après relance (« relance à »), pas l'incrément. */
  | { type: 'raise'; to: number }
  | { type: 'allIn' };

export type ActionError =
  | 'HAND_COMPLETE'
  | 'NOT_YOUR_TURN'
  | 'CANNOT_CHECK'
  | 'NOTHING_TO_CALL'
  | 'CANNOT_RAISE'
  | 'INVALID_AMOUNT';

/**
 * Ce qui s'est passé, dans l'ordre. Ces événements sont publics par construction :
 * aucune carte privée n'y figure, sauf celles révélées à tous (`cardsRevealed`).
 */
export type HandEvent =
  | {
      type: 'handStarted';
      handNumber: number;
      buttonSeat: number;
      smallBlindSeat: number;
      bigBlindSeat: number;
    }
  | { type: 'blindPosted'; seat: number; blind: 'small' | 'big'; amount: number }
  | { type: 'holeCardsDealt'; seats: number[] }
  | {
      type: 'playerActed';
      seat: number;
      action: 'fold' | 'check' | 'call' | 'bet' | 'raise';
      /** Mise totale du joueur sur la rue après son action. */
      amount: number;
      allIn: boolean;
    }
  | { type: 'uncalledBetReturned'; seat: number; amount: number }
  | { type: 'betsCollected'; pots: Pot[] }
  | { type: 'boardDealt'; street: Street; cards: Card[] }
  | { type: 'cardsRevealed'; hands: { seat: number; cards: [Card, Card] }[] }
  | { type: 'showdown'; hands: ShowdownHand[] }
  | { type: 'potAwarded'; potIndex: number; amount: number; winners: PotAward['winners'] }
  | { type: 'handEnded' };

export interface LegalActions {
  seat: number;
  canCheck: boolean;
  /** Jetons à ajouter pour suivre (plafonné au tapis) ; 0 si rien à suivre. */
  callAmount: number;
  /** Bornes du « relance à », ou null si la relance est impossible. */
  raise: { min: number; max: number } | null;
}

export type HandOutcome =
  { ok: true; hand: HandState; events: HandEvent[] } | { ok: false; error: ActionError };

export interface StartHandOptions {
  handNumber: number;
  participants: HandParticipant[];
  buttonSeat: number;
  blinds: Blinds;
}

export function startHand(
  options: StartHandOptions,
  randomInt: RandomInt,
): { hand: HandState; events: HandEvent[] } {
  const { handNumber, buttonSeat, blinds } = options;
  const participants = [...options.participants].sort((a, b) => a.seat - b.seat);
  if (participants.length < 2) throw new Error('Il faut au moins 2 joueurs');
  if (!participants.some((p) => p.seat === buttonSeat)) throw new Error('Bouton hors de la main');
  if (participants.some((p) => !Number.isInteger(p.stack) || p.stack <= 0)) {
    throw new Error('Chaque participant doit avoir un tapis positif');
  }

  // Sièges dans l'ordre de distribution : à gauche du bouton d'abord, le bouton en dernier.
  const order = rotateAfter(participants, buttonSeat).map((p) => p.seat);
  // Heads-up : le bouton est petite blind et parle en premier avant le flop.
  const headsUp = participants.length === 2;
  const smallBlindSeat = headsUp ? buttonSeat : (order[0] as number);
  const bigBlindSeat = headsUp ? (order[0] as number) : (order[1] as number);

  const deck = shuffle(createDeck(), randomInt);
  const holeCards = new Map<number, Card[]>();
  for (let round = 0; round < 2; round++) {
    for (const seat of order) holeCards.set(seat, [...(holeCards.get(seat) ?? []), draw(deck)]);
  }

  const hand: HandState = {
    handNumber,
    street: 'preflop',
    isComplete: false,
    players: participants.map((p) => ({
      seat: p.seat,
      id: p.id,
      stack: p.stack,
      holeCards: holeCards.get(p.seat) as [Card, Card],
      bet: 0,
      totalBet: 0,
      folded: false,
      actedAt: null,
      revealed: false,
    })),
    buttonSeat,
    smallBlindSeat,
    bigBlindSeat,
    blinds,
    deck,
    board: [],
    toAct: null,
    // Même si la grosse blind est à tapis pour moins, il faut suivre la grosse blind complète.
    currentBet: blinds.big,
    minRaise: blinds.big,
    fullRaiseAt: blinds.big,
    result: null,
  };

  const events: HandEvent[] = [
    { type: 'handStarted', handNumber, buttonSeat, smallBlindSeat, bigBlindSeat },
  ];
  postBlind(hand, smallBlindSeat, 'small', events);
  postBlind(hand, bigBlindSeat, 'big', events);
  events.push({ type: 'holeCardsDealt', seats: order });

  // Avant le flop, la parole commence à gauche de la grosse blind.
  settle(hand, events, bigBlindSeat);
  return { hand, events };
}

export function legalActions(hand: HandState): LegalActions | null {
  if (hand.isComplete || hand.toAct === null) return null;
  const player = getPlayer(hand, hand.toAct);
  const toCall = Math.max(0, hand.currentBet - player.bet);
  const max = player.bet + player.stack;
  const othersCanAct = hand.players.some((p) => p !== player && !p.folded && p.stack > 0);
  // Un tapis inférieur à une relance complète ne rouvre pas les enchères
  // pour ceux qui ont déjà parlé à ce niveau.
  const reopened = player.actedAt === null || hand.fullRaiseAt > player.actedAt;
  const canRaise = player.stack > toCall && othersCanAct && reopened;
  return {
    seat: player.seat,
    canCheck: toCall === 0,
    callAmount: Math.min(toCall, player.stack),
    raise: canRaise ? { min: Math.min(hand.currentBet + hand.minRaise, max), max } : null,
  };
}

export function applyAction(hand: HandState, seat: number, action: PlayerAction): HandOutcome {
  if (hand.isComplete) return { ok: false, error: 'HAND_COMPLETE' };
  const legal = legalActions(hand);
  if (!legal || legal.seat !== seat) return { ok: false, error: 'NOT_YOUR_TURN' };

  const next = cloneHand(hand);
  const player = getPlayer(next, seat);
  const acted = resolveAction(next, player, action, legal);
  if (typeof acted === 'object') return { ok: false, error: acted.error };

  player.actedAt = next.currentBet;
  const events: HandEvent[] = [
    {
      type: 'playerActed',
      seat,
      action: acted,
      amount: player.bet,
      allIn: !player.folded && player.stack === 0,
    },
  ];
  settle(next, events, seat);
  return { ok: true, hand: next, events };
}

/** Action jouée quand le temps est écoulé : parole si possible, sinon on se couche. */
export function defaultAction(hand: HandState): PlayerAction {
  return legalActions(hand)?.canCheck ? { type: 'check' } : { type: 'fold' };
}

/** Pots déjà ramassés au centre (sans les mises de la rue en cours, encore devant les joueurs). */
export function collectedPots(hand: HandState): Pot[] {
  return buildPots(
    hand.players.map((p) => ({ seat: p.seat, amount: p.totalBet - p.bet, folded: p.folded })),
  );
}

type ActedKind = Extract<HandEvent, { type: 'playerActed' }>['action'];

function resolveAction(
  hand: HandState,
  player: HandPlayer,
  action: PlayerAction,
  legal: LegalActions,
): ActedKind | { error: ActionError } {
  switch (action.type) {
    case 'fold':
      player.folded = true;
      return 'fold';
    case 'check':
      return legal.canCheck ? 'check' : { error: 'CANNOT_CHECK' };
    case 'call':
      if (legal.callAmount === 0) return { error: 'NOTHING_TO_CALL' };
      putChips(player, legal.callAmount);
      return 'call';
    case 'allIn':
    case 'raise': {
      const to = action.type === 'allIn' ? player.bet + player.stack : action.to;
      // Tapis qui ne dépasse pas la mise en cours : c'est un simple suivi.
      if (action.type === 'allIn' && to <= hand.currentBet) {
        putChips(player, player.stack);
        return 'call';
      }
      if (!legal.raise) return { error: 'CANNOT_RAISE' };
      if (!Number.isInteger(to) || to < legal.raise.min || to > legal.raise.max) {
        return { error: 'INVALID_AMOUNT' };
      }
      const kind = hand.currentBet === 0 ? 'bet' : 'raise';
      const increment = to - hand.currentBet;
      if (increment >= hand.minRaise) {
        hand.minRaise = increment;
        hand.fullRaiseAt = to;
      }
      hand.currentBet = to;
      putChips(player, to - player.bet);
      return kind;
    }
  }
}

/**
 * Fait avancer la main jusqu'au prochain joueur qui doit parler, ou jusqu'à la fin :
 * fin du tour d'enchères → rue suivante, plus personne pour miser → board déroulé, etc.
 */
function settle(hand: HandState, events: HandEvent[], lastSeat: number): void {
  for (;;) {
    const live = hand.players.filter((p) => !p.folded);
    if (live.length === 1) return finishWithoutShowdown(hand, events);

    const next = rotateAfter(hand.players, lastSeat).find((p) => needsToAct(hand, p));
    if (next) {
      hand.toAct = next.seat;
      return;
    }

    hand.toAct = null;
    closeBettingRound(hand, events);
    if (hand.street === 'river') return showdown(hand, events);

    if (live.filter((p) => p.stack > 0).length <= 1) {
      // Tout le monde (sauf au plus un) est à tapis : on montre les cartes et on déroule le board.
      revealHands(hand, events);
      dealRemainingStreets(hand, events);
      return showdown(hand, events);
    }

    dealNextStreet(hand, events);
    // Après le flop, la parole commence à gauche du bouton.
    lastSeat = hand.buttonSeat;
  }
}

function needsToAct(hand: HandState, player: HandPlayer): boolean {
  if (player.folded || player.stack === 0) return false;
  if (player.bet < hand.currentBet) return true;
  if (player.actedAt !== null) return false;
  // N'a pas encore parlé, mise égalisée : il ne parle que si quelqu'un peut encore lui répondre.
  return hand.players.some((p) => p !== player && !p.folded && p.stack > 0);
}

function closeBettingRound(hand: HandState, events: HandEvent[]): void {
  const uncalled = findUncalledBet(contributions(hand));
  if (uncalled) {
    const player = getPlayer(hand, uncalled.seat);
    player.stack += uncalled.amount;
    player.bet -= uncalled.amount;
    player.totalBet -= uncalled.amount;
    events.push({ type: 'uncalledBetReturned', ...uncalled });
  }
  for (const player of hand.players) {
    player.bet = 0;
    player.actedAt = null;
  }
  hand.currentBet = 0;
  hand.minRaise = hand.blinds.big;
  hand.fullRaiseAt = 0;
  events.push({ type: 'betsCollected', pots: buildPots(contributions(hand)) });
}

const NEXT_STREET = { preflop: 'flop', flop: 'turn', turn: 'river' } as const;

function dealNextStreet(hand: HandState, events: HandEvent[]): void {
  if (hand.street === 'river') throw new Error('Plus de rue après la river');
  const street = NEXT_STREET[hand.street];
  draw(hand.deck); // carte brûlée
  const cards = Array.from({ length: street === 'flop' ? 3 : 1 }, () => draw(hand.deck));
  hand.board.push(...cards);
  hand.street = street;
  events.push({ type: 'boardDealt', street, cards });
}

function dealRemainingStreets(hand: HandState, events: HandEvent[]): void {
  while (hand.street !== 'river') dealNextStreet(hand, events);
}

function revealHands(hand: HandState, events: HandEvent[]): void {
  const toReveal = hand.players.filter((p) => !p.folded && !p.revealed);
  if (toReveal.length === 0) return;
  for (const player of toReveal) player.revealed = true;
  events.push({
    type: 'cardsRevealed',
    hands: toReveal.map((p) => ({ seat: p.seat, cards: p.holeCards })),
  });
}

function showdown(hand: HandState, events: HandEvent[]): void {
  revealHands(hand, events);
  const evaluated = hand.players
    .filter((p) => !p.folded)
    .map((p) => ({ seat: p.seat, value: evaluateBest([...p.holeCards, ...hand.board]) }));
  const shown: ShowdownHand[] = evaluated.map(({ seat, value }) => ({
    seat,
    name: describeHand(value),
    cards: value.cards,
  }));
  events.push({ type: 'showdown', hands: shown });

  const scores = new Map(evaluated.map(({ seat, value }) => [seat, value.score]));
  finish(
    hand,
    events,
    awardPots(buildPots(contributions(hand)), scores, oddChipOrder(hand)),
    shown,
  );
}

function finishWithoutShowdown(hand: HandState, events: HandEvent[]): void {
  hand.toAct = null;
  closeBettingRound(hand, events);
  // Un seul joueur encore en jeu : il est l'unique éligible de chaque pot, pas besoin de score.
  finish(
    hand,
    events,
    awardPots(buildPots(contributions(hand)), new Map(), oddChipOrder(hand)),
    [],
  );
}

function finish(
  hand: HandState,
  events: HandEvent[],
  awards: PotAward[],
  showdownHands: ShowdownHand[],
): void {
  for (const award of awards) {
    for (const winner of award.winners) getPlayer(hand, winner.seat).stack += winner.amount;
    events.push({ type: 'potAwarded', ...award });
  }
  for (const player of hand.players) player.totalBet = 0;
  hand.isComplete = true;
  hand.toAct = null;
  hand.result = { awards, showdown: showdownHands };
  events.push({ type: 'handEnded' });
}

function postBlind(
  hand: HandState,
  seat: number,
  blind: 'small' | 'big',
  events: HandEvent[],
): void {
  const player = getPlayer(hand, seat);
  const amount = Math.min(blind === 'small' ? hand.blinds.small : hand.blinds.big, player.stack);
  putChips(player, amount);
  events.push({ type: 'blindPosted', seat, blind, amount });
}

function putChips(player: HandPlayer, amount: number): void {
  if (amount > player.stack) throw new Error(`Siège ${player.seat} : mise supérieure au tapis`);
  player.stack -= amount;
  player.bet += amount;
  player.totalBet += amount;
}

function contributions(hand: HandState): Contribution[] {
  return hand.players.map((p) => ({ seat: p.seat, amount: p.totalBet, folded: p.folded }));
}

/** Ordre de distribution du jeton impair : à partir de la gauche du bouton. */
function oddChipOrder(hand: HandState): number[] {
  return rotateAfter(hand.players, hand.buttonSeat).map((p) => p.seat);
}

/** Les éléments (triés par siège) en commençant par le premier siège après `seat`, en tournant. */
function rotateAfter<T extends { seat: number }>(items: readonly T[], seat: number): T[] {
  const start = items.findIndex((item) => item.seat > seat);
  if (start <= 0) return [...items];
  return [...items.slice(start), ...items.slice(0, start)];
}

function getPlayer(hand: HandState, seat: number): HandPlayer {
  const player = hand.players.find((p) => p.seat === seat);
  if (!player) throw new Error(`Aucun joueur au siège ${seat} dans cette main`);
  return player;
}

function draw(deck: Card[]): Card {
  const card = deck.shift();
  if (!card) throw new Error('Paquet vide');
  return card;
}

function cloneHand(hand: HandState): HandState {
  return {
    ...hand,
    players: hand.players.map((p) => ({ ...p, holeCards: [...p.holeCards] })),
    deck: [...hand.deck],
    board: [...hand.board],
  };
}
