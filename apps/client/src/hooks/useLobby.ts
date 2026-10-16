import type { LeaderboardEntry, RoomSummary } from '@poker/shared';
import { useEffect, useState } from 'react';
import { request, socket } from '../lib/socket';

export interface Lobby {
  rooms: RoomSummary[];
  leaderboard: LeaderboardEntry[];
  /** Mon identifiant public dans le classement. */
  you: string;
}

/** Salons publics et classement, tenus à jour en direct par le serveur. */
export function useLobby(): Lobby | null {
  const [lobby, setLobby] = useState<Lobby | null>(null);

  useEffect(() => {
    const subscribe = () => {
      void request('lobby:subscribe').then((res) => {
        if (res.ok) setLobby({ rooms: res.rooms, leaderboard: res.leaderboard, you: res.you });
      });
    };
    const onRooms = (rooms: RoomSummary[]) => setLobby((l) => (l ? { ...l, rooms } : l));
    const onLeaderboard = (leaderboard: LeaderboardEntry[]) =>
      setLobby((l) => (l ? { ...l, leaderboard } : l));

    subscribe();
    // Après une reconnexion, le serveur a oublié l'abonnement : on le refait.
    socket.on('connect', subscribe);
    socket.on('lobby:rooms', onRooms);
    socket.on('lobby:leaderboard', onLeaderboard);
    return () => {
      socket.off('connect', subscribe);
      socket.off('lobby:rooms', onRooms);
      socket.off('lobby:leaderboard', onLeaderboard);
      socket.emit('lobby:unsubscribe');
    };
  }, []);

  return lobby;
}
