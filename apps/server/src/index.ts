import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPokerApp } from './app';
import { StatsStore } from './stats/StatsStore';

const port = Number(process.env.PORT ?? 3000);
const clientDir =
  process.env.CLIENT_DIR ?? fileURLToPath(new URL('../../client/dist', import.meta.url));
// Le classement est sauvegardé dans DATA_DIR (un volume Docker en production).
const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL('../data', import.meta.url));
const trustProxy = process.env.TRUST_PROXY === '1';

const stats = new StatsStore(join(dataDir, 'stats.json'));
await stats.load();

// crypto.randomInt : hasard cryptographique, imprévisible même en connaissant les mains passées.
const server = createPokerApp({ randomInt, clientDir, stats, trustProxy });

server.httpServer.listen(port, () => {
  console.log(`Serveur poker sur le port ${port}${trustProxy ? ' (derrière un proxy)' : ''}`);
});

// Un bug imprévu ne doit pas passer inaperçu : on le journalise. Une exception non
// rattrapée laisse le processus dans un état incertain : on quitte, Docker redémarre.
process.on('unhandledRejection', (reason) => console.error('[process] promesse rejetée :', reason));
process.on('uncaughtException', (error) => {
  console.error('[process] exception non rattrapée :', error);
  void stats.flush().finally(() => process.exit(1));
});

// `docker stop` envoie SIGTERM : on ferme proprement les connexions avant de quitter.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`${signal} reçu, arrêt…`);
    void server.close().then(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  });
}
