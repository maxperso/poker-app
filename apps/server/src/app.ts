import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import type { RandomInt } from '@poker/engine';
import express from 'express';
import { nanoid } from 'nanoid';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager';
import {
  broadcastRoom,
  createLobbyNotifier,
  notifyRoomClosed,
  type PokerServer,
  registerSocketHandlers,
} from './socket';

export interface PokerServerOptions {
  randomInt: RandomInt;
  /** Dossier du client buildé (Vite). null : API seule (dev, tests). */
  clientDir: string | null;
}

export interface PokerApp {
  httpServer: HttpServer;
  io: PokerServer;
  manager: RoomManager;
  close: () => Promise<void>;
}

/**
 * Un seul processus sert le client ET Socket.io sur le même port. Le navigateur parle
 * donc à une seule origine : pas de CORS, et le reverse proxy n'a qu'une cible.
 */
export function createPokerApp({ randomInt, clientDir }: PokerServerOptions): PokerApp {
  const app = express();
  app.disable('x-powered-by');
  // Derrière Nginx Proxy Manager : un seul proxy de confiance devant nous.
  app.set('trust proxy', 1);

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, rooms: manager.size });
  });

  if (clientDir && existsSync(join(clientDir, 'index.html'))) {
    // Les fichiers de /assets ont un hash dans leur nom : cache navigateur long et immuable.
    app.use(
      '/assets',
      express.static(join(clientDir, 'assets'), { immutable: true, maxAge: '1y' }),
    );
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    // Application monopage : toute autre URL (ex. /r/abc123) renvoie index.html.
    app.get('/{*path}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(clientDir, 'index.html'));
    });
  }

  const httpServer = createServer(app);
  const io: PokerServer = new Server(httpServer, { serveClient: false });

  let notifyLobby = () => {};
  const manager = new RoomManager({
    randomInt,
    now: Date.now,
    createId: (size) => nanoid(size),
    onRoomChange: (room, events) => {
      broadcastRoom(io, room, events);
      notifyLobby();
    },
    onRoomClosed: (room) => {
      notifyRoomClosed(io, room);
      notifyLobby();
    },
  });
  notifyLobby = createLobbyNotifier(io, manager);
  registerSocketHandlers(io, manager);

  const sweeper = setInterval(() => manager.sweep(), 60_000);
  sweeper.unref();

  return {
    httpServer,
    io,
    manager,
    close: async () => {
      clearInterval(sweeper);
      manager.dispose();
      await io.close();
    },
  };
}
