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

1. Trouver le réseau Docker de Nginx Proxy Manager :

   ```sh
   docker network ls        # ex. « npm_default » ou « nginx-proxy-manager_default »
   ```

2. Sur le serveur, dans le dossier du projet, créer un fichier `.env` :

   ```sh
   NPM_NETWORK=npm_default
   ```

3. Construire et lancer :

   ```sh
   docker compose up -d --build
   ```

4. Dans Nginx Proxy Manager, ajouter un **Proxy Host** :
   - Domain : `poker.maxperso.fr`
   - Scheme `http`, Forward Hostname `poker`, Forward Port `3000`
   - **Websockets Support : activé** (indispensable pour Socket.io)
   - **Block Common Exploits : activé**
   - Onglet SSL : certificat Let's Encrypt, « Force SSL », « HTTP/2 », « HSTS Enabled »

Vérifier : `https://poker.maxperso.fr/healthz` doit répondre `{"ok":true,...}`.

Si NPM tourne sur une autre machine, décommenter `ports` dans `docker-compose.yml`
et faire pointer NPM vers `IP-du-serveur:3000`.

Mise à jour : `git pull && docker compose up -d --build` (les parties en cours sont perdues,
le classement est conservé dans le volume `poker-data`).
