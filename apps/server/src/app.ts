import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import type { RandomInt } from '@poker/engine';
import express from 'express';
import helmet from 'helmet';
import { nanoid } from 'nanoid';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager';
import { LIMITS } from './security';
import {
  broadcastRoom,
  createLeaderboardNotifier,
  createLobbyNotifier,
  notifyRoomClosed,
  type PokerServer,
  registerSocketHandlers,
} from './socket';
import { StatsStore } from './stats/StatsStore';

export interface PokerServerOptions {
  randomInt: RandomInt;
  /** Dossier du client buildé (Vite). null : API seule (dev, tests). */
  clientDir: string | null;
  /** Statistiques des joueurs (classement). Par défaut : en mémoire seulement. */
  stats?: StatsStore;
  /** Derrière un reverse proxy de confiance (Nginx Proxy Manager) : TRUST_PROXY=1. */
  trustProxy?: boolean;
}

export interface PokerApp {
  httpServer: HttpServer;
  io: PokerServer;
  manager: RoomManager;
  stats: StatsStore;
  close: () => Promise<void>;
}

/**
 * Un seul processus sert le client ET Socket.io sur le même port. Le navigateur parle
 * donc à une seule origine : pas de CORS, et le reverse proxy n'a qu'une cible.
 */
export function createPokerApp({
  randomInt,
  clientDir,
  stats = new StatsStore(null),
  trustProxy = false,
}: PokerServerOptions): PokerApp {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);

  // En-têtes de sécurité. La CSP n'autorise que nos propres fichiers, plus Google Fonts :
  // un script injecté d'ailleurs ne s'exécuterait pas (et ne pourrait pas voler le jeton).
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          // Motion et React posent des styles en ligne (positions, animations).
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': null,
        },
      },
      // HTTPS est géré par Nginx Proxy Manager, qui ajoute HSTS s'il est activé.
      strictTransportSecurity: false,
    }),
  );

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
  const io: PokerServer = new Server(httpServer, {
    serveClient: false,
    // Une action fait une centaine d'octets : au-delà de 16 Ko, c'est un abus.
    maxHttpBufferSize: LIMITS.maxMessageBytes,
  });

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
    onHandComplete: (hand) => stats.record(hand),
  });
  notifyLobby = createLobbyNotifier(io, manager);
  stats.onChange = createLeaderboardNotifier(io, stats);
  registerSocketHandlers(io, { manager, stats, trustProxy });

  const sweeper = setInterval(() => manager.sweep(), 60_000);
  sweeper.unref();

  return {
    httpServer,
    io,
    manager,
    stats,
    close: async () => {
      clearInterval(sweeper);
      manager.dispose();
      await io.close();
      await stats.flush();
    },
  };
}
