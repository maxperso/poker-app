import type { RandomInt } from '@poker/engine';
import type { GameEvent, RoomConfig, RoomSummary } from '@poker/shared';
import { Room } from './Room';

export interface RoomManagerDeps {
  randomInt: RandomInt;
  now: () => number;
  createId: (size: number) => string;
  onRoomChange: (room: Room, events: GameEvent[]) => void;
  onRoomClosed: (room: Room) => void;
}

/** Durées de conservation (ms). */
export const TTL = {
  /** Un membre déconnecté depuis plus longtemps perd sa place. */
  disconnectedMember: 10 * 60_000,
  /** Un salon vide depuis plus longtemps est supprimé. */
  emptyRoom: 5 * 60_000,
};

/**
 * Tous les salons, en mémoire. Un redémarrage efface tout : c'est accepté.
 * Conséquence importante : une seule instance du serveur peut tourner,
 * sinon deux joueurs du même salon pourraient tomber sur deux processus différents.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly deps: RoomManagerDeps) {}

  create(config: RoomConfig, creatorToken: string): Room {
    let id = this.deps.createId(10);
    while (this.rooms.has(id)) id = this.deps.createId(10);
    const room = new Room(id, config, creatorToken, {
      randomInt: this.deps.randomInt,
      now: this.deps.now,
      createId: this.deps.createId,
      onChange: this.deps.onRoomChange,
    });
    this.rooms.set(id, room);
    return room;
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Salons publics, les plus récents d'abord. Les salons privés n'y figurent jamais. */
  publicSummaries(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((room) => room.config.visibility === 'public')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((room) => room.summary());
  }

  /** Ménage périodique : membres partis depuis longtemps, salons vides. */
  sweep(): void {
    const now = this.deps.now();
    for (const room of [...this.rooms.values()]) {
      for (const member of [...room.members.values()]) {
        if (
          member.connections === 0 &&
          member.disconnectedAt !== null &&
          now - member.disconnectedAt > TTL.disconnectedMember
        ) {
          room.leave(member.token);
        }
      }
      if (room.emptySince !== null && now - room.emptySince > TTL.emptyRoom) {
        room.dispose();
        this.rooms.delete(room.id);
        this.deps.onRoomClosed(room);
      }
    }
  }

  dispose(): void {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
