import type { RoomSummary } from '@poker/shared';
import { useEffect, useState } from 'react';
import { request, socket } from '../lib/socket';

/** Liste des salons publics, tenue à jour en direct par le serveur. */
export function useLobby(): RoomSummary[] | null {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);

  useEffect(() => {
    const subscribe = () => {
      void request('lobby:subscribe').then((res) => {
        if (res.ok) setRooms(res.rooms);
      });
    };
    subscribe();
    // Après une reconnexion, le serveur a oublié l'abonnement : on le refait.
    socket.on('connect', subscribe);
    socket.on('lobby:rooms', setRooms);
    return () => {
      socket.off('connect', subscribe);
      socket.off('lobby:rooms', setRooms);
      socket.emit('lobby:unsubscribe');
    };
  }, []);

  return rooms;
}
