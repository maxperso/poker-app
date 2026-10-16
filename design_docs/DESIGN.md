# DESIGN.md — Poker interco (direction « Club classique »)

Ce fichier décrit le design retenu. Les maquettes de référence sont fournies en
captures d'écran (table, accueil, choix du pseudo). En cas de doute, ce fichier
fait foi sur les valeurs (couleurs, tailles, positions) ; les captures montrent
l'intention visuelle.

Les cartes des maquettes sont des placeholders : dans le jeu, utiliser les SVG
fournis dans [CHEMIN DES SVG].

---

## 1. Tokens

### Couleurs

| Rôle | Valeur |
|---|---|
| Fond de page (dégradé radial, centre → bord) | `#18261e` → `#0a0f0c` |
| Surface (cartouches, cartes UI, panneaux) | `#15120e` |
| Champ de saisie | `#0c0a08` |
| Texte principal | `#f2efe6` |
| Texte secondaire | `#bdb8aa` |
| Texte discret / légendes | `#8f8a7c` |
| Accent or (titres, boutons principaux, bordures actives) | `#d4a64a` |
| Or clair (texte sur fond sombre, libellés) | `#ecd49c` |
| Or des montants (stacks) | `#e2b961` |
| Bordure or discrète | `rgba(212,166,74,0.25)` à `0.4` |
| Tapis (dégradé radial centre → bord) | `#237e4e` → `#155c37` → `#0e4127` |
| Rebord de table (bois) | `#3a2416`, liseré extérieur `#1c110a` |
| Bouton « Suivre » | `#1f7a4a` (texte blanc) |
| Bouton « Se coucher » | `#3a3631` |
| Jeton | `#b8322a` avec bordure pointillée `#f2efe6` |
| Dos de carte (si pas de SVG dédié) | rayures 45° `#7a1f2b` / `#5c1520`, bordure `#f2efe6` |
| Statut « En cours » | fond `rgba(31,122,74,0.3)`, texte `#9ee0b8` |
| Statut « En attente » | fond `rgba(212,166,74,0.18)`, texte `#ecd49c` |

Le texte sur un bouton or est toujours foncé (`#14110c`), jamais blanc
(contraste insuffisant).

### Typographie (Google Fonts)

- **Barlow Condensed** 600/700 : titres, montants, libellés de boutons d'action
  (en majuscules, `letter-spacing: 0.03em` à `0.06em`), initiales des avatars.
- **Barlow** 400/500/600 : texte courant, pseudos, champs de formulaire.

Tailles clés : titre de page 48px, titre de section 28px, montant du héros 22px,
pseudo d'un siège 14px, stack d'un siège 17px.

### Formes

- Rayons : boutons 8–12px, cartouches de siège 10px, panneaux 14–16px, pastilles 999px.
- Cibles cliquables : 44px de haut minimum.
- Ombres : uniquement sous les cartes et la table ; halo or (`box-shadow` or à
  ~0.35 d'opacité) pour signaler le joueur dont c'est le tour.

---

## 2. Écran de jeu (table) — référence 1280×800

### Disposition

- **Barre du haut** (60px) : nom du salon en or majuscules, pastille « Privé »
  ou « Public », « Blinds 10 / 20 · Main n°42 » ; à droite « Copier le lien » et
  « Quitter ».
- **Table** : forme de stade (rectangle aux bouts arrondis, `border-radius` = moitié
  de la hauteur), 920×430, centrée en (640, 340), rebord bois de 18px, liseré
  intérieur fin à 46px du bord. Texte « POKER INTERCO » très discret
  (blanc à 8 % d'opacité) sous les cartes communes.
- **Pot** : pastille sombre au-dessus des cartes communes.
- **Cartes communes** : 5 emplacements de 66×92 centrés, écart 10px. Un emplacement
  pas encore distribué = contour pointillé blanc à 20 %.
- **Joueur local (héros)** : toujours en bas au centre, quel que soit son numéro
  de siège côté serveur (les places sont pivotées pour chaque client).
  - Ses deux cartes en grand (108×150), inclinées de −6° et +6°, qui débordent
    sur le rebord de la table.
  - Sous les cartes, un cartouche de 250×68 : avatar avec anneau de timer,
    pseudo, « À toi · 12 s », stack en grand.
- **Adversaires** : répartis sur une ellipse (voir § 4), chacun avec avatar,
  deux petits dos de carte s'il est encore dans le coup, cartouche pseudo + stack.
- **Mises du tour** : jeton + montant dans une pastille sombre, entre le joueur et
  le centre de la table.
- **Bouton dealer** : disque blanc « D », entre le joueur et le centre, plus près
  du joueur que sa mise.
- **Historique** (bas gauche) : « DERNIÈRES ACTIONS » puis les 3 dernières lignes.
- **Barre d'actions** (bas droite, 386px de large), visible seulement quand c'est
  au tour du héros :
  1. raccourcis Min / ½ pot / Pot / Tapis (le raccourci actif passe en fond or) ;
  2. curseur de mise (`accent-color` or) avec son libellé ;
  3. SE COUCHER / SUIVRE {montant} / RELANCER {montant} (56px de haut). Le libellé
     de RELANCER suit la valeur du curseur. Si rien à suivre : « PAROLE » au lieu
     de « SUIVRE ».

### États d'un siège

| État | Rendu |
|---|---|
| En jeu | opacité 1, deux dos de carte visibles |
| Couché | opacité 0.4, pas de dos de carte |
| À son tour | anneau de timer autour de l'avatar (`conic-gradient` or qui se vide), cartouche avec bordure or et halo |
| All-in | [à définir — proposition : pastille « TAPIS » or sur le cartouche] |
| Déconnecté | [à définir — proposition : opacité 0.6 + mention « Absent »] |
| Siège vide | [à définir — proposition : cercle pointillé « Libre »] |

### Avatars

Cercle de couleur avec l'initiale du pseudo en Barlow Condensed. La couleur est
choisie de façon déterministe à partir d'un hash du pseudo, dans la palette :
`#e8b04f #7fb3d5 #c39bd3 #76d7c4 #f1948a #f7dc6f #85c1e9 #bb8fce`.
Texte de l'initiale : `#14110c`.

---

## 3. Accueil — page fluide, conteneur max 1120px

- **En-tête** : logo (jeton + « POKER INTERCO » en or) ; à droite, pastille
  avec l'avatar, le pseudo et un bouton « Changer ».
- **Titre** « Choisis ta table », puis l'accroche « L'interco, c'est dur. Le poker,
  un peu moins. » (Barlow Condensed 24px, `#e2b961`), puis la phrase d'introduction.
- **Deux colonnes** qui passent l'une sous l'autre en dessous de ~920px :
  - **Gauche** :
    - bloc « Tu as reçu un lien ? » : champ + bouton REJOINDRE (contour or) ;
    - « Salons publics » + compteur ;
    - une ligne par salon : mini-table, nom, « Blinds · Stack », avatars des
      3 premiers joueurs qui se chevauchent, « 5 / 9 », pastille de statut,
      bouton REJOINDRE (or) ou COMPLET (désactivé) ;
    - mention : les salons privés n'apparaissent pas dans la liste.
  - **Droite**, panneau « Créer un salon » (bordure or) :
    - nom du salon ;
    - nombre de places : grille de 8 boutons, de 2 à 9 (6 par défaut) ;
    - visibilité : Public / Privé, avec une phrase d'aide qui change selon le choix ;
    - blinds et stack de départ (listes déroulantes) ;
    - bouton CRÉER LE SALON.

## 4. Choix du pseudo (premier accès)

Carte centrée de 440px max sur le fond de page : logo, bandeau vert
« Tu es invité dans le salon « X » » si on arrive par un lien, aperçu de l'avatar
(96px) qui se met à jour en direct pendant la saisie, champ pseudo
(16 caractères max), bouton REJOINDRE LA TABLE (arrivée par lien) ou ENTRER,
mention « Ton pseudo est gardé sur cet appareil, pas besoin de compte ».

---

## 5. Placement des sièges (table de référence 1280×800)

n = nombre de places du salon (2 à 9). Le héros est l'indice 0, en bas au centre.
Les autres sièges, dans l'ordre de jeu (sens horaire à l'écran) :

```
centre de l'ellipse des sièges : cx = 640, cy = 360
rayons : rx = 540, ry = 265
centre de la table : fx = 640, fy = 340

pour k = 1 .. n-1 (k = décalage par rapport au siège du héros) :
  angle = (90 + k * 360 / n) degrés      // 90° = bas de l'écran
  x = cx + rx * cos(angle)
  y = cy + ry * sin(angle)
  siège (140×90)  : left = x - 70, top = y - 40
  mise            : point situé à 42 % du trajet entre (x, y) et (fx, fy)
  bouton dealer   : point situé à 20 % du même trajet
```

Le décalage k se calcule côté client : `k = (siègeServeur - siègeDuHéros + n) % n`.
La table doit être mise à l'échelle comme un bloc (par exemple un conteneur
1280×800 avec `transform: scale()` calculé selon la fenêtre) plutôt que
recalculée avec des pourcentages.

## 6. Hors périmètre des maquettes

Non dessinés, à proposer dans le même style avant de les coder :
- abattage (révélation des cartes, mise en avant de la main gagnante) ;
- écran d'attente avant le lancement de la partie par l'hôte ;
- version mobile ;
- animations : prévues avec Framer Motion pour la distribution, les jetons vers
  le pot et le retournement des cartes, mais leurs durées et courbes ne sont
  pas fixées.
