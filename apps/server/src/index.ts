import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPokerApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const clientDir =
  process.env.CLIENT_DIR ?? fileURLToPath(new URL('../../client/dist', import.meta.url));

// crypto.randomInt : hasard cryptographique, imprévisible même en connaissant les mains passées.
const server = createPokerApp({ randomInt, clientDir });

server.httpServer.listen(port, () => {
  console.log(`Serveur poker sur le port ${port}`);
});

// `docker stop` envoie SIGTERM : on ferme proprement les connexions avant de quitter.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`${signal} reçu, arrêt…`);
    void server.close().then(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  });
}
