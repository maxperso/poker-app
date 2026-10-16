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
   - Domain : `poker.ton-domaine.fr`
   - Scheme `http`, Forward Hostname `poker`, Forward Port `3000`
   - **Websockets Support : activé** (indispensable pour Socket.io)
   - Onglet SSL : certificat Let's Encrypt, « Force SSL »

Vérifier : `https://poker.ton-domaine.fr/healthz` doit répondre `{"ok":true,...}`.

Si NPM tourne sur une autre machine, décommenter `ports` dans `docker-compose.yml`
et faire pointer NPM vers `IP-du-serveur:3000`.

Mise à jour : `git pull && docker compose up -d --build` (les parties en cours sont perdues).
