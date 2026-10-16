import type { PlayerAction, TableError } from '@poker/engine';
import type { CreateRoomInput } from './schemas';
import type { RoomStateMessage, RoomSummary } from './views';

export type ErrorCode =
  | TableError
  | 'INVALID_INPUT'
  | 'ROOM_NOT_FOUND'
  | 'NICKNAME_TAKEN'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'ALREADY_STARTED'
  | 'STALE_HAND'
  | 'CANNOT_REBUY'
  | 'INTERNAL_ERROR';

/** Réponse (ack) d'une requête : `{ ok: true, ...données }` ou `{ ok: false, error }`. */
export type Ack<T extends object = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };

type Reply<T extends object = object> = (response: Ack<T>) => void;

/**
 * Le contrat Socket.io, partagé par le client et le serveur :
 * `new Server<ClientToServerEvents, ServerToClientEvents>()` côté serveur,
 * `io() as Socket<ServerToClientEvents, ClientToServerEvents>` côté client.
 * Renommer un champ ici casse la compilation des deux côtés.
 */
export interface ClientToServerEvents {
  'lobby:subscribe': (reply: Reply<{ rooms: RoomSummary[] }>) => void;
  'lobby:unsubscribe': () => void;
  'room:create': (input: CreateRoomInput, reply: Reply<{ roomId: string }>) => void;
  /** Nom d'un salon avant d'y entrer (bandeau « Tu es invité dans… »). */
  'room:peek': (input: { roomId: string }, reply: Reply<{ name: string }>) => void;
  'room:join': (input: { roomId: string; nickname: string }, reply: Reply) => void;
  'room:leave': (reply: Reply) => void;
  'seat:take': (input: { seat: number }, reply: Reply) => void;
  'seat:leave': (reply: Reply) => void;
  'game:start': (reply: Reply) => void;
  'game:action': (input: { handNumber: number; action: PlayerAction }, reply: Reply) => void;
  'player:rebuy': (reply: Reply) => void;
  'player:sitOut': (input: { sittingOut: boolean }, reply: Reply) => void;
}

export interface ServerToClientEvents {
  'lobby:rooms': (rooms: RoomSummary[]) => void;
  'room:state': (message: RoomStateMessage) => void;
  'room:closed': (payload: { reason: 'expired' }) => void;
}

/** Données d'authentification envoyées à la connexion : `io({ auth: { token } })`. */
export interface HandshakeAuth {
  token: string;
}
