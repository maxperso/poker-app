import type { Ack, ClientToServerEvents, ErrorCode, ServerToClientEvents } from '@poker/shared';
import { io, type Socket } from 'socket.io-client';
import { getToken } from './identity';

export type PokerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Une seule connexion pour toute l'application. Même origine que la page :
 * en dev, Vite relaie /socket.io vers le serveur ; en prod, c'est le même processus.
 * Socket.io se reconnecte tout seul après une coupure, avec le même jeton.
 */
export const socket: PokerSocket = io({ auth: { token: getToken() } });

export type ClientError = ErrorCode | 'TIMEOUT';
export type Result<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: ClientError };

type EventName = keyof ClientToServerEvents;
type Args<E extends EventName> =
  Parameters<ClientToServerEvents[E]> extends [...infer A, unknown] ? A : never;
type AckOf<E extends EventName> =
  Parameters<ClientToServerEvents[E]> extends [...unknown[], (response: infer R) => void]
    ? R
    : never;

/** Envoie une requête et attend la réponse du serveur (8 s maximum). */
export async function request<E extends EventName>(
  event: E,
  ...args: Args<E>
): Promise<AckOf<E> | { ok: false; error: 'TIMEOUT' }> {
  // `.call(withTimeout, …)` : emitWithAck est une méthode, elle a besoin de son `this`.
  const withTimeout = socket.timeout(8_000);
  const emit = withTimeout.emitWithAck as (e: E, ...a: unknown[]) => Promise<Ack>;
  try {
    return (await emit.call(withTimeout, event, ...args)) as AckOf<E>;
  } catch (error) {
    // emitWithAck rejette uniquement quand le délai expire.
    console.warn(`[socket] ${event} :`, error);
    return { ok: false, error: 'TIMEOUT' };
  }
}
