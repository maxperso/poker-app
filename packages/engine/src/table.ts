import type { RandomInt } from './cards';
import {
  type ActionError,
  applyAction,
  type Blinds,
  type HandEvent,
  type HandState,
  type PlayerAction,
  startHand,
} from './hand';

export interface TableSeat {
  id: string;
  stack: number;
  /** Absent volontairement (ou déconnecté) : reste assis mais n'est pas servi. */
  sittingOut: boolean;
}

export interface TableState {
  seats: (TableSeat | null)[];
  /** null tant qu'aucune main n'a été jouée. */
  buttonSeat: number | null;
  handNumber: number;
  /** Main en cours, ou dernière main terminée (gardée pour l'affichage jusqu'à la suivante). */
  hand: HandState | null;
}

export type TableError =
  | ActionError
  | 'INVALID_SEAT'
  | 'SEAT_TAKEN'
  | 'ALREADY_SEATED'
  | 'NOT_SEATED'
  | 'INVALID_AMOUNT'
  | 'IN_HAND'
  | 'HAND_IN_PROGRESS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NO_HAND';

export type TableOutcome =
  { ok: true; table: TableState; events: HandEvent[] } | { ok: false; error: TableError };

export function createTable(seatCount: number): TableState {
  if (!Number.isInteger(seatCount) || seatCount < 2 || seatCount > 9) {
    throw new Error(`Nombre de places invalide : ${seatCount}`);
  }
  return {
    seats: Array.from({ length: seatCount }, () => null),
    buttonSeat: null,
    handNumber: 0,
    hand: null,
  };
}

export function isHandInProgress(table: TableState): boolean {
  return table.hand !== null && !table.hand.isComplete;
}

/** Le siège participe-t-il à la main en cours ? (Un joueur assis pendant une main attend la suivante.) */
export function isInHand(table: TableState, seat: number): boolean {
  return isHandInProgress(table) && (table.hand?.players.some((p) => p.seat === seat) ?? false);
}

/** Sièges qui seront servis à la prochaine main. */
export function dealableSeats(table: TableState): number[] {
  return table.seats.flatMap((s, seat) => (s && s.stack > 0 && !s.sittingOut ? [seat] : []));
}

export function sitDown(table: TableState, seat: number, id: string, stack: number): TableOutcome {
  if (!isValidSeat(table, seat)) return fail('INVALID_SEAT');
  if (table.seats[seat]) return fail('SEAT_TAKEN');
  if (table.seats.some((s) => s?.id === id)) return fail('ALREADY_SEATED');
  if (!isPositiveInteger(stack)) return fail('INVALID_AMOUNT');
  return ok(withSeat(table, seat, { id, stack, sittingOut: false }));
}

/** Quitter son siège. Impossible pendant une main où l'on joue : il faut d'abord se coucher. */
export function standUp(table: TableState, seat: number): TableOutcome {
  if (!table.seats[seat]) return fail('NOT_SEATED');
  if (isInHand(table, seat)) return fail('IN_HAND');
  return ok(withSeat(table, seat, null));
}

export function setSittingOut(table: TableState, seat: number, sittingOut: boolean): TableOutcome {
  const current = table.seats[seat];
  if (!current) return fail('NOT_SEATED');
  return ok(withSeat(table, seat, { ...current, sittingOut }));
}

/** Recave : ajoute des jetons entre deux mains (ou si le joueur ne joue pas la main en cours). */
export function addChips(table: TableState, seat: number, amount: number): TableOutcome {
  const current = table.seats[seat];
  if (!current) return fail('NOT_SEATED');
  if (isInHand(table, seat)) return fail('IN_HAND');
  if (!isPositiveInteger(amount)) return fail('INVALID_AMOUNT');
  return ok(withSeat(table, seat, { ...current, stack: current.stack + amount }));
}

/**
 * Lance la main suivante. Le bouton avance au prochain joueur servi
 * (règle simplifiée du « bouton qui avance », sans bouton mort) ;
 * pour la toute première main, il est tiré au sort.
 */
export function startNextHand(
  table: TableState,
  blinds: Blinds,
  randomInt: RandomInt,
): TableOutcome {
  if (isHandInProgress(table)) return fail('HAND_IN_PROGRESS');
  const seats = dealableSeats(table);
  if (seats.length < 2) return fail('NOT_ENOUGH_PLAYERS');

  const buttonSeat =
    table.buttonSeat === null
      ? (seats[randomInt(seats.length)] as number)
      : (seats.find((s) => s > (table.buttonSeat as number)) ?? (seats[0] as number));

  const handNumber = table.handNumber + 1;
  const { hand, events } = startHand(
    {
      handNumber,
      buttonSeat,
      blinds,
      participants: seats.map((seat) => {
        const s = table.seats[seat] as TableSeat;
        return { seat, id: s.id, stack: s.stack };
      }),
    },
    randomInt,
  );
  return ok(syncStacks({ ...table, buttonSeat, handNumber, hand }), events);
}

export function act(table: TableState, seat: number, action: PlayerAction): TableOutcome {
  if (!table.hand) return fail('NO_HAND');
  const outcome = applyAction(table.hand, seat, action);
  if (!outcome.ok) return outcome;
  return ok(syncStacks({ ...table, hand: outcome.hand }), outcome.events);
}

/**
 * Les tapis de la table reflètent ceux de la main : pendant la main ce sont les jetons
 * restants (hors mises), à la fin les gains sont inclus.
 */
function syncStacks(table: TableState): TableState {
  const hand = table.hand;
  if (!hand) return table;
  return {
    ...table,
    seats: table.seats.map((s, seat) => {
      const player = hand.players.find((p) => p.seat === seat);
      return s && player && player.id === s.id ? { ...s, stack: player.stack } : s;
    }),
  };
}

function withSeat(table: TableState, seat: number, value: TableSeat | null): TableState {
  return { ...table, seats: table.seats.map((s, i) => (i === seat ? value : s)) };
}

function isValidSeat(table: TableState, seat: number): boolean {
  return Number.isInteger(seat) && seat >= 0 && seat < table.seats.length;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function ok(table: TableState, events: HandEvent[] = []): TableOutcome {
  return { ok: true, table, events };
}

function fail(error: TableError): TableOutcome {
  return { ok: false, error };
}
