import { createRoomSchema, type CreateRoomInput, type GameEvent } from '@poker/shared';
import { Room } from '../src/rooms/Room';
import type { HandStat } from '../src/stats/StatsStore';
import { seededRandomInt } from '../../../packages/engine/test/helpers';

export { seededRandomInt };

export const token = (name: string) => `token-${name}`.padEnd(20, '0');

export const HOST = token('host');

/** Un salon de test. Les horloges sont celles de vitest (vi.useFakeTimers). */
export function makeRoom(
  overrides: Partial<CreateRoomInput> = {},
  seed = 1,
  onHandComplete?: (stats: HandStat[]) => void,
) {
  const changes: GameEvent[][] = [];
  let nextId = 0;
  const room = new Room(
    'room000001',
    createRoomSchema.parse({ name: 'Test', visibility: 'public', ...overrides }),
    HOST,
    {
      randomInt: seededRandomInt(seed),
      now: () => Date.now(),
      createId: () => `id${++nextId}`,
      onChange: (_room, events) => changes.push(events),
      ...(onHandComplete ? { onHandComplete } : {}),
    },
  );
  return { room, changes, events: () => changes.flat() };
}

/** Fait entrer et asseoir des joueurs : seated(room, ['host', 'bob']) → hôte au siège 0, bob au 1. */
export function seatPlayers(room: Room, names: string[]): string[] {
  return names.map((name, seat) => {
    const t = name === 'host' ? HOST : token(name);
    expectOk(room.join(t, name));
    room.connect(t);
    expectOk(room.takeSeat(t, seat));
    return t;
  });
}

export function expectOk(result: { ok: boolean; error?: string }): void {
  if (!result.ok) throw new Error(`Refusé : ${result.error}`);
}

/** Jeton du joueur à qui c'est le tour. */
export function tokenToAct(room: Room): string {
  const seat = room.table.hand?.toAct;
  if (seat === null || seat === undefined) throw new Error('Personne ne doit jouer');
  const id = room.table.seats[seat]?.id;
  const member = [...room.members.values()].find((m) => m.publicId === id);
  if (!member) throw new Error('Membre introuvable');
  return member.token;
}
