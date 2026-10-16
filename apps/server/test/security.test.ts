import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@poker/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createPokerApp, type PokerApp } from '../src/app';
import { clientIp, LIMITS, TokenBucket } from '../src/security';
import { expectOk, makeRoom, seededRandomInt, token } from './helpers';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

describe('TokenBucket', () => {
  test('autorise une rafale, puis le débit de recharge', () => {
    let now = 0;
    const bucket = new TokenBucket(3, 2, () => now);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    now = 500; // 0,5 s à 2/s → 1 jeton
    expect([bucket.take(), bucket.take()]).toEqual([true, false]);
  });
});

describe('clientIp', () => {
  const request = (headers: Record<string, string>, remote = '10.0.0.2') =>
    ({ headers, socket: { remoteAddress: remote } }) as unknown as IncomingMessage;

  test('sans proxy de confiance, les en-têtes sont ignorés (sinon chacun s’inventerait une IP)', () => {
    expect(clientIp(request({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' }), false)).toBe(
      '10.0.0.2',
    );
  });

  test('derrière le proxy : X-Real-IP, posé par le proxy lui-même', () => {
    expect(clientIp(request({ 'x-real-ip': '1.2.3.4' }), true)).toBe('1.2.3.4');
  });

  test('derrière le proxy, sans X-Real-IP : la dernière entrée de X-Forwarded-For', () => {
    // « 6.6.6.6 » a été envoyé par le client (falsifiable) ; « 1.2.3.4 » a été ajouté par le proxy.
    expect(clientIp(request({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }), true)).toBe('1.2.3.4');
  });
});

describe('plafonds', () => {
  test(`un salon n'accepte pas plus de ${LIMITS.membersPerRoom} membres`, () => {
    const { room } = makeRoom();
    for (let i = 0; i < LIMITS.membersPerRoom; i++)
      expectOk(room.join(token(`member-${i}-`), `Membre${i}`));
    expect(room.join(token('trop'), 'EnTrop')).toEqual({ ok: false, error: 'LIMIT_REACHED' });
    // Un membre existant peut toujours revenir.
    expectOk(room.join(token('member-0-'), 'Membre0'));
  });
});

describe('attaques par le réseau', () => {
  let app: PokerApp;
  let url: string;
  const clients: Client[] = [];

  beforeEach(async () => {
    app = createPokerApp({ randomInt: seededRandomInt(9), clientDir: null });
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
    url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    await app.close();
  });

  function client(name: string): Client {
    const socket: Client = connect(url, {
      auth: { token: token(name) },
      transports: ['websocket'],
      reconnection: false,
    });
    clients.push(socket);
    return socket;
  }

  function request(
    socket: Client,
    event: keyof ClientToServerEvents,
    ...args: unknown[]
  ): Promise<Ack> {
    return new Promise((resolve) => {
      (socket.emit as (...a: unknown[]) => void)(event, ...args, resolve);
    });
  }

  const ROOM = { name: 'Test', visibility: 'public' } as const;

  test('inondation de messages : refus au-delà du débit autorisé', async () => {
    const attacker = client('flood');
    const replies = await Promise.all(
      Array.from({ length: LIMITS.burst + 20 }, () =>
        request(attacker, 'room:peek', { roomId: 'abcdefghij' }),
      ),
    );
    expect(
      replies.filter((r) => !r.ok && r.error === 'RATE_LIMITED').length,
    ).toBeGreaterThanOrEqual(20);
  });

  test('inondation persistante : la connexion est coupée', async () => {
    const attacker = client('flood2');
    await new Promise((resolve) => attacker.on('connect', () => resolve(null)));
    const disconnected = new Promise((resolve) => attacker.on('disconnect', () => resolve(null)));
    for (let i = 0; i < LIMITS.burst + LIMITS.maxViolations + 10; i++)
      attacker.emit('lobby:unsubscribe');
    await disconnected;
    expect(attacker.connected).toBe(false);
  });

  test('message géant : refusé (connexion coupée), le serveur continue de tourner', async () => {
    const attacker = client('huge');
    await new Promise((resolve) => attacker.on('connect', () => resolve(null)));
    const disconnected = new Promise((resolve) => attacker.on('disconnect', () => resolve(null)));
    attacker.emit(
      'room:create',
      { ...ROOM, name: 'x'.repeat(LIMITS.maxMessageBytes * 2) },
      () => {},
    );
    await disconnected;
    const honest = client('honest');
    expect(await request(honest, 'room:create', ROOM)).toMatchObject({ ok: true });
  });

  test(`pas plus de ${LIMITS.roomsPerIp} salons créés par la même IP`, async () => {
    const attacker = client('spam');
    for (let i = 0; i < LIMITS.roomsPerIp; i++) {
      expect(await request(attacker, 'room:create', ROOM)).toMatchObject({ ok: true });
    }
    expect(await request(attacker, 'room:create', ROOM)).toEqual({
      ok: false,
      error: 'LIMIT_REACHED',
    });
  });

  test(`pas plus de ${LIMITS.connectionsPerIp} connexions simultanées par IP`, async () => {
    const sockets = Array.from({ length: LIMITS.connectionsPerIp }, (_, i) => client(`c${i}`));
    await Promise.all(
      sockets.map((s) => new Promise((resolve) => s.on('connect', () => resolve(null)))),
    );
    const extra = client('extra');
    const error = await new Promise<Error>((resolve) => extra.on('connect_error', resolve));
    expect(error.message).toBe('TOO_MANY_CONNECTIONS');
  });

  test.each([
    ['montant hors des entiers sûrs', { handNumber: 1, action: { type: 'raise', to: 1e20 } }],
    ['montant négatif', { handNumber: 1, action: { type: 'raise', to: -50 } }],
    ['type d’action inventé', { handNumber: 1, action: { type: 'win' } }],
    ['pollution de prototype', JSON.parse('{"__proto__": {"admin": true}, "handNumber": 1}')],
  ])('entrée forgée (%s) : INVALID_INPUT', async (_label, payload) => {
    const attacker = client('forge');
    expect(await request(attacker, 'game:action', payload)).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  test('en-têtes de sécurité HTTP', async () => {
    const response = await fetch(`${url}/healthz`);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-powered-by')).toBeNull();
  });
});
