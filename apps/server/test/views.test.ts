import type { Card } from '@poker/engine';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Room } from '../src/rooms/Room';
import { buildView } from '../src/views';
import { expectOk, HOST, makeRoom, seatPlayers, token, tokenToAct } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Cartes qu'un membre n'a PAS le droit de voir : privées des autres (non révélées) et paquet. */
function forbiddenCards(room: Room, viewerToken: string): Card[] {
  const hand = room.table.hand!;
  const mySeat = room.seatOf(viewerToken);
  const othersHidden = hand.players
    .filter((p) => p.seat !== mySeat && !p.revealed)
    .flatMap((p) => p.holeCards);
  return [...othersHidden, ...hand.deck];
}

function expectNoLeak(room: Room, viewerToken: string): void {
  const json = JSON.stringify(buildView(room, viewerToken));
  for (const card of forbiddenCards(room, viewerToken)) {
    expect(json, `la carte ${card} a fuité`).not.toContain(`"${card}"`);
  }
  for (const member of room.members.values()) {
    expect(json, 'un jeton secret a fuité').not.toContain(member.token);
  }
}

function startedRoom() {
  const { room } = makeRoom();
  const tokens = seatPlayers(room, ['host', 'bob', 'carol']);
  expectOk(room.join(token('dave'), 'Dave')); // spectateur
  expectOk(room.start(HOST));
  return { room, tokens, spectator: token('dave') };
}

describe('buildView : aucune fuite de cartes', () => {
  test('chaque joueur ne voit que ses propres cartes', () => {
    const { room, tokens } = startedRoom();
    for (const t of tokens) {
      const view = buildView(room, t);
      const mySeat = room.seatOf(t) as number;
      view.seats.forEach((seat, index) => {
        if (!seat) return;
        if (index === mySeat)
          expect(seat.cards).toEqual(
            room.table.hand!.players.find((p) => p.seat === index)!.holeCards,
          );
        else expect(seat.cards).toBe('hidden');
      });
      expectNoLeak(room, t);
    }
  });

  test('un spectateur ne voit aucune carte privée', () => {
    const { room, spectator } = startedRoom();
    const view = buildView(room, spectator);
    expect(view.you.seat).toBeNull();
    expect(view.seats.filter(Boolean).every((s) => s!.cards === 'hidden')).toBe(true);
    expectNoLeak(room, spectator);
  });

  test('cartes révélées à tous quand plus personne ne peut miser', () => {
    const { room, tokens, spectator } = startedRoom();
    const n = room.table.hand!.handNumber;
    expectOk(room.act(tokenToAct(room), n, { type: 'allIn' }));
    expectOk(room.act(tokenToAct(room), n, { type: 'call' }));
    expectOk(room.act(tokenToAct(room), n, { type: 'fold' }));
    const hand = room.table.hand!;
    expect(hand.isComplete).toBe(true);

    const view = buildView(room, spectator);
    for (const player of hand.players) {
      const shown = view.seats[player.seat]?.cards;
      if (player.revealed) expect(shown).toEqual(player.holeCards);
      else expect(shown).toBeNull(); // couché : ses cartes ne sont plus affichées
    }
    for (const t of [...tokens, spectator]) expectNoLeak(room, t);
  });

  test('un joueur couché voit encore ses cartes, les autres non', () => {
    const { room, spectator } = startedRoom();
    const folder = tokenToAct(room);
    expectOk(room.act(folder, room.table.hand!.handNumber, { type: 'fold' }));
    const seat = room.seatOf(folder) as number;
    expect(buildView(room, folder).seats[seat]?.cards).not.toBeNull();
    expect(buildView(room, spectator).seats[seat]?.cards).toBeNull();
  });
});

describe('buildView : contenu', () => {
  test('actions possibles seulement pour le joueur dont c’est le tour', () => {
    const { room, tokens } = startedRoom();
    const current = tokenToAct(room);
    for (const t of tokens) {
      const { legal } = buildView(room, t).you;
      if (t === current) expect(legal).not.toBeNull();
      else expect(legal).toBeNull();
    }
  });

  test('membres, hôte, blinds et chrono', () => {
    const { room } = startedRoom();
    const view = buildView(room, HOST);
    expect(view.you.isHost).toBe(true);
    expect(view.members.map((m) => [m.nickname, m.isHost, m.seat])).toEqual([
      ['host', true, 0],
      ['bob', false, 1],
      ['carol', false, 2],
      ['Dave', false, null],
    ]);
    expect(view.blinds).toEqual({ small: 10, big: 20, level: 0, nextLevelAt: null });
    expect(view.turnDeadline).toBe(Date.now() + 30_000);
    expect(view.hand?.pots).toEqual([]);
  });
});
