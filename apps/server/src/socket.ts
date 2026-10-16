import {
  type Ack,
  type ClientToServerEvents,
  createRoomSchema,
  gameActionSchema,
  type GameEvent,
  joinRoomSchema,
  roomIdSchema,
  type ServerToClientEvents,
  sitOutSchema,
  takeSeatSchema,
  tokenSchema,
} from '@poker/shared';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type { Room } from './rooms/Room';
import type { RoomManager } from './rooms/RoomManager';
import { clientIp, Counter, LIMITS, TokenBucket } from './security';
import { playerKey, type StatsStore } from './stats/StatsStore';
import { buildView } from './views';

export interface SocketData {
  token: string;
  roomId: string | null;
  ip: string;
}

export type PokerServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type PokerSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const LOBBY = 'lobby';
/** Canal d'un membre : toutes ses connexions (onglets) le rejoignent. */
const memberChannel = (roomId: string, publicId: string) => `member:${roomId}:${publicId}`;
const roomChannel = (roomId: string) => `room:${roomId}`;

/**
 * Envoie à chaque membre SA vue du salon. Pas de broadcast global : chacun a une vue
 * différente (ses cartes), donc un envoi par membre. À 9 joueurs, c'est négligeable.
 */
export function broadcastRoom(io: PokerServer, room: Room, events: GameEvent[]): void {
  const serverNow = Date.now();
  for (const member of room.members.values()) {
    if (member.connections === 0) continue;
    io.to(memberChannel(room.id, member.publicId)).emit('room:state', {
      seq: room.seq,
      serverNow,
      view: buildView(room, member.token),
      events,
    });
  }
}

export function notifyRoomClosed(io: PokerServer, room: Room): void {
  io.to(roomChannel(room.id)).emit('room:closed', { reason: 'expired' });
  io.in(roomChannel(room.id)).socketsLeave(roomChannel(room.id));
}

/** Envoie la liste des salons aux abonnés, seulement si elle a changé. */
export function createLobbyNotifier(io: PokerServer, manager: RoomManager): () => void {
  let last = '';
  return () => {
    const rooms = manager.publicSummaries();
    const serialized = JSON.stringify(rooms);
    if (serialized === last) return;
    last = serialized;
    io.to(LOBBY).emit('lobby:rooms', rooms);
  };
}

/** Envoie le classement aux abonnés du lobby (au plus une fois par seconde). */
export function createLeaderboardNotifier(io: PokerServer, stats: StatsStore): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      io.to(LOBBY).emit('lobby:leaderboard', stats.leaderboard());
    }, 1_000);
    timer.unref();
  };
}

export interface SocketOptions {
  manager: RoomManager;
  stats: StatsStore;
  /** Derrière un reverse proxy de confiance : lire la vraie IP dans ses en-têtes. */
  trustProxy: boolean;
}

export function registerSocketHandlers(
  io: PokerServer,
  { manager, stats, trustProxy }: SocketOptions,
): void {
  const connectionsPerIp = new Counter();

  // À la connexion : jeton valide obligatoire, et pas plus de N connexions par IP.
  io.use((socket, next) => {
    const token = tokenSchema.safeParse((socket.handshake.auth as { token?: unknown }).token);
    if (!token.success) return next(new Error('INVALID_TOKEN'));
    const ip = clientIp(socket.request, trustProxy);
    if (connectionsPerIp.get(ip) >= LIMITS.connectionsPerIp)
      return next(new Error('TOO_MANY_CONNECTIONS'));
    connectionsPerIp.increment(ip);
    socket.data.token = token.data;
    socket.data.roomId = null;
    socket.data.ip = ip;
    next();
  });

  io.on('connection', (socket: PokerSocket) => {
    const { token, ip } = socket.data;
    const bucket = new TokenBucket(LIMITS.burst, LIMITS.perSecond);
    let violations = 0;
    const currentRoom = () => (socket.data.roomId ? manager.get(socket.data.roomId) : undefined);

    /**
     * Enregistre un handler robuste : l'entrée est validée par zod, l'ack est optionnel
     * (un client peut ne pas en fournir), et une exception ne fait pas tomber le serveur.
     */
    function on<S extends z.ZodType | null>(
      event: keyof ClientToServerEvents,
      schema: S,
      handler: (input: S extends z.ZodType ? z.output<S> : undefined) => Ack,
    ): void {
      (socket.on as (event: string, listener: (...args: unknown[]) => void) => void)(
        event,
        (...args: unknown[]) => {
          const reply = args.at(-1);
          const respond = (response: Ack) => {
            if (typeof reply === 'function') (reply as (r: Ack) => void)(response);
          };
          // Limite de débit : au-delà, refus ; un client qui insiste est déconnecté.
          if (!bucket.take()) {
            violations++;
            if (violations > LIMITS.maxViolations) socket.disconnect(true);
            return respond({ ok: false, error: 'RATE_LIMITED' });
          }
          try {
            if (schema === null) return respond(handler(undefined as never));
            const parsed = schema.safeParse(args[0]);
            if (!parsed.success) return respond({ ok: false, error: 'INVALID_INPUT' });
            respond(handler(parsed.data as never));
          } catch (error) {
            console.error(`[socket] ${event} :`, error);
            respond({ ok: false, error: 'INTERNAL_ERROR' });
          }
        },
      );
    }

    function inRoom(command: (room: Room) => Ack): Ack {
      const room = currentRoom();
      return room ? command(room) : { ok: false, error: 'NOT_IN_ROOM' };
    }

    function detach(): void {
      const room = currentRoom();
      socket.data.roomId = null;
      if (!room) return;
      const member = room.members.get(token);
      if (member) void socket.leave(memberChannel(room.id, member.publicId));
      void socket.leave(roomChannel(room.id));
      room.disconnect(token);
    }

    on('lobby:subscribe', null, () => {
      void socket.join(LOBBY);
      return {
        ok: true,
        rooms: manager.publicSummaries(),
        leaderboard: stats.leaderboard(),
        // Identifiant public du joueur, pour qu'il se repère dans le classement.
        you: playerKey(token),
      } as Ack;
    });
    on('lobby:unsubscribe', null, () => {
      void socket.leave(LOBBY);
      return { ok: true };
    });

    on('room:create', createRoomSchema, (config) => {
      const room = manager.create(config, token, ip);
      if (room === 'LIMIT_REACHED') return { ok: false, error: 'LIMIT_REACHED' };
      return { ok: true, roomId: room.id } as Ack;
    });

    on('room:peek', z.object({ roomId: roomIdSchema }), ({ roomId }) => {
      const room = manager.get(roomId);
      return room
        ? ({ ok: true, name: room.config.name } as Ack)
        : { ok: false, error: 'ROOM_NOT_FOUND' };
    });

    on('room:join', joinRoomSchema, ({ roomId, nickname }) => {
      const room = manager.get(roomId);
      if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
      const alreadyAttached = socket.data.roomId === roomId;
      if (!alreadyAttached) detach();
      const result = room.join(token, nickname);
      if (!result.ok || alreadyAttached) return result;

      const member = room.members.get(token)!;
      void socket.join(memberChannel(roomId, member.publicId));
      void socket.join(roomChannel(roomId));
      socket.data.roomId = roomId;
      room.connect(token); // envoie l'état complet, y compris à cette nouvelle connexion
      return result;
    });

    on('room:leave', null, () =>
      inRoom((room) => {
        detach();
        return room.leave(token);
      }),
    );
    on('seat:take', takeSeatSchema, ({ seat }) => inRoom((room) => room.takeSeat(token, seat)));
    on('seat:leave', null, () => inRoom((room) => room.leaveSeat(token)));
    on('game:start', null, () => inRoom((room) => room.start(token)));
    on('game:action', gameActionSchema, ({ handNumber, action }) =>
      inRoom((room) => room.act(token, handNumber, action)),
    );
    on('player:rebuy', null, () => inRoom((room) => room.rebuy(token)));
    on('player:sitOut', sitOutSchema, ({ sittingOut }) =>
      inRoom((room) => room.setSittingOut(token, sittingOut)),
    );

    socket.on('disconnect', () => {
      connectionsPerIp.decrement(ip);
      detach();
    });
  });
}
