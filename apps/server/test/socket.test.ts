import type { AddressInfo } from 'node:net';
import type {
  Ack,
  ClientToServerEvents,
  RoomStateMessage,
  RoomSummary,
  ServerToClientEvents,
} from '@poker/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createPokerApp, type PokerApp } from '../src/app';
import { seededRandomInt, token } from './helpers';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let app: PokerApp;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  app = createPokerApp({ randomInt: seededRandomInt(5), clientDir: null });
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await app.close();
});

function client(name: string): Client {
  const socket: Client = connect(url, { auth: { token: token(name) }, transports: ['websocket'] });
  clients.push(socket);
  return socket;
}

/** Envoie une requête et attend son ack. */
function request<T extends object>(
  socket: Client,
  event: keyof ClientToServerEvents,
  ...args: unknown[]
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    (socket.emit as (...a: unknown[]) => void)(event, ...args, resolve);
  });
}

/** Attend le prochain état de salon qui vérifie `predicate`. */
function nextState(
  socket: Client,
  predicate: (m: RoomStateMessage) => boolean = () => true,
): Promise<RoomStateMessage> {
  return new Promise((resolve) => {
    const listener = (message: RoomStateMessage) => {
      if (!predicate(message)) return;
      socket.off('room:state', listener);
      resolve(message);
    };
    socket.on('room:state', listener);
  });
}

const ROOM = { name: 'Entre amis', visibility: 'public' } as const;

describe('connexion', () => {
  test('refuse un jeton invalide', async () => {
    const socket: Client = connect(url, { auth: { token: 'court' }, transports: ['websocket'] });
    clients.push(socket);
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('INVALID_TOKEN');
  });

  test('entrée invalide : INVALID_INPUT, sans faire tomber le serveur', async () => {
    const alice = client('alice');
    expect(await request(alice, 'room:create', { name: '', visibility: 'secret' })).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    expect(await request(alice, 'room:join', { roomId: 'trop court', nickname: 'A' })).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    expect(await request(alice, 'room:join', { roomId: 'abcdefghij', nickname: 'A' })).toEqual({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
    expect(await request(alice, 'game:start')).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });
});

describe('lobby', () => {
  test('les salons publics apparaissent, les privés jamais', async () => {
    const alice = client('alice');
    const watcher = client('watcher');
    const initial = await request<{ rooms: RoomSummary[] }>(watcher, 'lobby:subscribe');
    expect(initial).toEqual({ ok: true, rooms: [] });

    const update = new Promise<RoomSummary[]>((resolve) => watcher.once('lobby:rooms', resolve));
    await request(alice, 'room:create', { ...ROOM, visibility: 'private', name: 'Secret' });
    const created = await request<{ roomId: string }>(alice, 'room:create', ROOM);
    if (!created.ok) throw new Error(created.error);
    await request(alice, 'room:join', { roomId: created.roomId, nickname: 'Alice' });
    await request(alice, 'seat:take', { seat: 0 });

    const rooms = await update;
    expect(rooms.map((r) => r.name)).toEqual(['Entre amis']);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.manager.publicSummaries()).toEqual([
      { id: created.roomId, name: 'Entre amis', players: 1, maxSeats: 6, status: 'waiting' },
    ]);
  });
});

describe('partie complète', () => {
  async function setupGame() {
    const alice = client('alice');
    const bob = client('bob');
    const created = await request<{ roomId: string }>(alice, 'room:create', ROOM);
    if (!created.ok) throw new Error(created.error);
    const { roomId } = created;
    expect(await request(alice, 'room:join', { roomId, nickname: 'Alice' })).toEqual({ ok: true });
    expect(await request(bob, 'room:join', { roomId, nickname: 'alice' })).toEqual({
      ok: false,
      error: 'NICKNAME_TAKEN',
    });
    expect(await request(bob, 'room:join', { roomId, nickname: 'Bob' })).toEqual({ ok: true });
    await request(alice, 'seat:take', { seat: 0 });
    await request(bob, 'seat:take', { seat: 3 });
    return { alice, bob, roomId };
  }

  test("chacun reçoit sa vue : ses cartes, celles de l'autre face cachée", async () => {
    const { alice, bob } = await setupGame();
    expect(await request(bob, 'game:start')).toEqual({ ok: false, error: 'NOT_HOST' });

    const started = (m: RoomStateMessage) => m.view.hand !== null;
    const [aliceState, bobState] = await Promise.all([
      nextState(alice, started),
      nextState(bob, started),
      request(alice, 'game:start'),
    ]);

    expect(aliceState.view.seats[0]?.cards).toHaveLength(2);
    expect(aliceState.view.seats[3]?.cards).toBe('hidden');
    expect(bobState.view.seats[3]?.cards).toHaveLength(2);
    expect(bobState.view.seats[0]?.cards).toBe('hidden');
    expect(aliceState.events.map((e) => e.type)).toContain('handStarted');
    expect(JSON.stringify(aliceState)).not.toContain(token('bob'));
  });

  test('une action passe par le serveur et met à jour tout le monde', async () => {
    const { alice, bob } = await setupGame();
    const [state] = await Promise.all([
      nextState(alice, (m) => m.view.hand !== null),
      request(alice, 'game:start'),
    ]);
    const hand = state.view.hand!;
    const toActIsAlice = hand.toAct === 0;
    const actor = toActIsAlice ? alice : bob;
    const other = toActIsAlice ? bob : alice;

    expect(
      await request(other, 'game:action', {
        handNumber: hand.handNumber,
        action: { type: 'fold' },
      }),
    ).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });

    const folded = nextState(other, (m) => m.events.some((e) => e.type === 'playerActed'));
    expect(
      await request(actor, 'game:action', {
        handNumber: hand.handNumber,
        action: { type: 'fold' },
      }),
    ).toEqual({ ok: true });
    const message = await folded;
    expect(message.view.hand?.isComplete).toBe(true);
    expect(message.events.map((e) => e.type)).toContain('potAwarded');
  });

  test('après une coupure, le même jeton retrouve sa place', async () => {
    const { bob, roomId } = await setupGame();
    bob.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const bobSeat = () =>
      [...app.manager.get(roomId)!.members.values()].find((m) => m.nickname === 'Bob');
    expect(bobSeat()?.connections).toBe(0);

    const again = client('bob');
    const state = nextState(again);
    expect(await request(again, 'room:join', { roomId, nickname: 'Bob' })).toEqual({ ok: true });
    const { view } = await state;
    expect(view.you.seat).toBe(3);
    expect(bobSeat()?.connections).toBe(1);
  });
});
