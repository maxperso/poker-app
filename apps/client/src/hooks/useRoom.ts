import type { GameEvent, RoomStateMessage, RoomView } from '@poker/shared';
import { useEffect, useRef, useState } from 'react';
import { type ClientError, request, socket } from '../lib/socket';

export type RoomConnection =
  | { status: 'joining' }
  | { status: 'error'; error: ClientError | 'ROOM_CLOSED' }
  | {
      status: 'ready';
      view: RoomView;
      /** Événements du dernier message (pour les animations). */
      events: GameEvent[];
      /** serveur − client, en ms : `Date.now() + clockOffset` ≈ heure du serveur. */
      clockOffset: number;
      connected: boolean;
    };

/**
 * Rejoint un salon et suit son état. Le serveur envoie à chaque changement une photo
 * complète de ce qu'on a le droit de voir : on la remplace telle quelle, sans fusion.
 */
/**
 * Départ différé : quitter la page du salon envoie « room:leave » un court instant après.
 * Si la page se remonte aussitôt (mode strict de React en dev, retour rapide), on annule.
 */
let pendingLeave: { roomId: string; timer: ReturnType<typeof setTimeout> } | null = null;

export function useRoom(roomId: string, nickname: string): RoomConnection {
  const [state, setState] = useState<RoomConnection>({ status: 'joining' });
  const lastSeq = useRef(-1);

  useEffect(() => {
    lastSeq.current = -1;
    setState({ status: 'joining' });
    if (pendingLeave) {
      clearTimeout(pendingLeave.timer);
      // Un autre salon était en attente de départ : on le quitte maintenant.
      if (pendingLeave.roomId !== roomId) void request('room:leave');
      pendingLeave = null;
    }

    const join = () => {
      void request('room:join', { roomId, nickname }).then((res) => {
        if (!res.ok) setState({ status: 'error', error: res.error });
      });
    };

    const onState = (message: RoomStateMessage) => {
      if (message.view.id !== roomId) return;
      // Un message plus ancien que le dernier reçu (réseau capricieux) est ignoré.
      if (message.seq <= lastSeq.current) return;
      lastSeq.current = message.seq;
      setState({
        status: 'ready',
        view: message.view,
        events: message.events,
        clockOffset: message.serverNow - Date.now(),
        connected: true,
      });
    };

    const onDisconnect = () =>
      setState((current) =>
        current.status === 'ready' ? { ...current, connected: false } : current,
      );
    const onClosed = () => setState({ status: 'error', error: 'ROOM_CLOSED' });

    join();
    // Après une reconnexion, la nouvelle connexion doit rejoindre le salon (même jeton → même place).
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('room:closed', onClosed);
    return () => {
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('room:closed', onClosed);
      // Quitter la page du salon = quitter le salon (un rechargement, lui, garde la place).
      pendingLeave = { roomId, timer: setTimeout(() => void request('room:leave'), 300) };
    };
  }, [roomId, nickname]);

  return state;
}

/** Heure du serveur estimée, mise à jour régulièrement (pour les comptes à rebours). */
export function useServerNow(clockOffset: number, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), intervalMs);
    return () => clearInterval(id);
  }, [clockOffset, intervalMs]);
  return now;
}
