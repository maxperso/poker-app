# Poker Interco

Texas Hold'em No-Limit entre amis, en jetons fictifs. Sans compte : un pseudo, un lien, on joue.

## Architecture

```
packages/engine   moteur de jeu pur (cartes, évaluation, side pots, déroulé d'une main), testé
packages/shared   contrat client ⇄ serveur : événements Socket.io typés, vues, schémas zod
apps/server       Node + Express + Socket.io : salons en mémoire, vues filtrées par joueur
apps/client       React + Vite + Tailwind + Motion (charte : design_docs/DESIGN.md)
```

- **Le serveur fait autorité** : il mélange (`crypto.randomInt`), distribue et valide chaque action.
  Le client n'envoie que des intentions (`fold`, `call`, `raise to X`…).
- **Aucune fuite de cartes** : tout ce qui part vers un client passe par `apps/server/src/views.ts`,
  qui construit la vue de chaque joueur en liste blanche (testé).
- **État en mémoire** : un redémarrage efface les parties. Conséquence : **une seule instance**.
- **Classement** : seule donnée conservée, dans un fichier JSON (`DATA_DIR/stats.json`,
  un volume Docker en production). Un joueur y est identifié par l'empreinte SHA-256 de son jeton.

## Sécurité

Le site est public : il doit tenir face à un client malveillant (tests : `apps/server/test/security.test.ts`).

- Toute entrée est validée (zod) ; les montants, sièges et actions sont revérifiés par le moteur.
- Débit limité par connexion (rafale de 30 messages puis 10/s), déconnexion si abus répété.
- Plafonds : 40 connexions par IP, 5 salons par IP, 200 salons au total, 30 membres par salon,
  messages de 16 Ko maximum.
- En-têtes HTTP (helmet) : CSP stricte (aucun script tiers), anti-iframe, `nosniff`.
- Conteneur : utilisateur non-root, système de fichiers en lecture seule, aucune capacité Linux,
  mémoire plafonnée.
- Derrière Nginx Proxy Manager, `TRUST_PROXY=1` fait lire la vraie IP dans `X-Real-IP`.
  Sans proxy, ne pas l'activer (sinon un client pourrait s'inventer une IP).

## Développement

Prérequis : Node 24 (`fnm use` lit le `.nvmrc`).

```sh
npm install
npm run dev      # serveur sur :3001 + client Vite sur http://localhost:5173
npm run check    # typecheck + lint + format + tests
```

## Déploiement (Docker + Nginx Proxy Manager)

L'image contient le serveur et le client buildé : un seul processus, un seul port (3000).

1. Sur le serveur :

   ```sh
   git clone https://github.com/maxperso/poker-app.git && cd poker-app
   docker compose up -d --build
   docker ps                      # « poker » doit être « Up … (healthy) »
   ```

   Le jeu répond sur `http://IP-du-serveur:3000` (autre port : `POKER_PORT=8080` dans `.env`).

2. Dans Nginx Proxy Manager, ajouter un **Proxy Host** :
   - Domain : `poker.maxperso.fr`
   - Scheme `http`, Forward Hostname `IP-du-serveur` (ex. `192.168.1.53`), Forward Port `3000`
   - **Websockets Support : activé** (indispensable pour Socket.io)
   - **Block Common Exploits : activé**
   - Onglet SSL : certificat Let's Encrypt, « Force SSL », « HTTP/2 », « HSTS Enabled »

Vérifier : `https://poker.maxperso.fr/healthz` doit répondre `{"ok":true,...}`.

**Variante** — NPM tourne dans Docker sur la même machine : le conteneur peut rejoindre son
réseau et ne plus ouvrir de port (voir `docker-compose.npm.yml`) :

```sh
docker network ls                                   # repérer le réseau de NPM
echo "NPM_NETWORK=nom_du_reseau" > .env
docker compose -f docker-compose.yml -f docker-compose.npm.yml up -d --build
```

Dans NPM, viser alors `poker:3000`.

Mise à jour : `git pull && docker compose up -d --build` (les parties en cours sont perdues,
le classement est conservé dans le volume `poker-data`).
