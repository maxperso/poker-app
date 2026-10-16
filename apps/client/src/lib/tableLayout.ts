/**
 * Géométrie de l'écran de jeu, en pixels d'une scène de taille fixe.
 * La scène entière est ensuite mise à l'échelle d'un bloc (`<Stage>`, transform: scale),
 * comme le demande DESIGN.md §5 : on ne recalcule pas les positions en pourcentages.
 *
 * - `desktop` : valeurs exactes de DESIGN.md (référence 1280×800).
 * - `mobile`  : proposition pour le portrait (hors périmètre des maquettes, §6).
 */
export interface Point {
  x: number;
  y: number;
}

export interface StageLayout {
  name: 'desktop' | 'mobile';
  width: number;
  height: number;
  topBar: number;
  /** Table en forme de stade (bouts arrondis), rebord bois compris. */
  table: {
    cx: number;
    cy: number;
    width: number;
    height: number;
    rail: number;
    innerInset: number;
  };
  /** Siège d'un adversaire : boîte width×height, le point d'ellipse est à `anchorY` du haut. */
  seat: {
    width: number;
    height: number;
    anchorY: number;
    avatar: number;
    plateTop: number;
    plateHeight: number;
    name: number;
    stack: number;
    cardW: number;
    cardH: number;
  };
  board: { cx: number; cy: number; cardW: number; cardH: number; gap: number };
  potY: number;
  watermarkY: number;
  hero: {
    cardsCx: number;
    cardsTop: number;
    cardW: number;
    cardH: number;
    /** Écart horizontal entre le centre de la table et le centre de chaque carte. */
    spread: number;
    panel: { x: number; y: number; w: number; h: number };
  };
  history: { x: number; y: number; w: number };
  actions: { x: number; y: number; w: number };
  /** Position du siège situé `k` places après le héros (k = 0 : le héros, en bas au centre). */
  seatPoint: (k: number, count: number) => Point;
  /** Centre de la table, vers lequel on place mises et bouton dealer. */
  focus: Point;
  /** Position de la mise et du bouton dealer sur le trajet siège → centre (0 à 1). */
  betRatio: number;
  dealerRatio: number;
  /** Le trajet de la mise part du centre du cartouche (et non du point d'ellipse). */
  betFromPlate: boolean;
  /** Bouton dealer collé à gauche de l'avatar plutôt que sur le trajet vers le centre. */
  dealerBesideAvatar: boolean;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

export const DESKTOP: StageLayout = {
  name: 'desktop',
  width: 1280,
  height: 800,
  topBar: 60,
  table: { cx: 640, cy: 340, width: 920, height: 430, rail: 18, innerInset: 46 },
  seat: {
    width: 140,
    height: 90,
    anchorY: 40,
    avatar: 46,
    plateTop: 44,
    plateHeight: 46,
    name: 14,
    stack: 17,
    cardW: 30,
    cardH: 42,
  },
  board: { cx: 640, cy: 330, cardW: 66, cardH: 92, gap: 10 },
  potY: 256,
  watermarkY: 424,
  hero: {
    cardsCx: 640,
    cardsTop: 490,
    cardW: 108,
    cardH: 150,
    spread: 52,
    panel: { x: 515, y: 636, w: 250, h: 68 },
  },
  history: { x: 24, y: 652, w: 360 },
  actions: { x: 870, y: 620, w: 386 },
  // DESIGN.md §5 : angle = 90° + k·360/n, ellipse (640, 360) de rayons 540 × 265.
  seatPoint: (k, count) => {
    const angle = toRad(90 + (k * 360) / count);
    return { x: 640 + 540 * Math.cos(angle), y: 360 + 265 * Math.sin(angle) };
  },
  focus: { x: 640, y: 340 },
  betRatio: 0.42,
  dealerRatio: 0.2,
  betFromPlate: false,
  dealerBesideAvatar: false,
};

export const MOBILE: StageLayout = {
  name: 'mobile',
  // Ratio ≈ fenêtre utile d'un téléphone en portrait (barres du navigateur déduites).
  width: 430,
  height: 800,
  topBar: 52,
  table: { cx: 215, cy: 300, width: 290, height: 440, rail: 14, innerInset: 28 },
  seat: {
    width: 104,
    height: 74,
    anchorY: 32,
    avatar: 36,
    plateTop: 34,
    plateHeight: 40,
    name: 12,
    stack: 15,
    cardW: 22,
    cardH: 31,
  },
  board: { cx: 215, cy: 312, cardW: 42, cardH: 59, gap: 6 },
  potY: 242,
  watermarkY: 370,
  hero: {
    cardsCx: 215,
    cardsTop: 498,
    cardW: 80,
    cardH: 112,
    spread: 38,
    panel: { x: 100, y: 604, w: 230, h: 58 },
  },
  history: { x: 18, y: 676, w: 394 },
  actions: { x: 12, y: 670, w: 406 },
  // Portrait : on laisse libre le bas de l'ovale (réservé au héros) et on répartit
  // les adversaires sur les 270° restants.
  seatPoint: (k, count) => {
    if (k === 0) return { x: 215, y: 540 };
    const angle = count === 2 ? 270 : 135 + ((k - 1) * 270) / (count - 2);
    const a = toRad(angle);
    return { x: 215 + 158 * Math.cos(a), y: 300 + 216 * Math.sin(a) };
  },
  focus: { x: 215, y: 300 },
  // Table étroite : la mise part du centre du cartouche pour passer sous celui-ci.
  betRatio: 0.55,
  dealerRatio: 0.3,
  betFromPlate: true,
  dealerBesideAvatar: true,
};

/** Point situé à `ratio` du trajet de `from` vers `to`. */
export function along(from: Point, to: Point, ratio: number): Point {
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
}

/**
 * Décalage d'affichage d'un siège : 0 = le joueur local (en bas au centre),
 * puis dans l'ordre du jeu. Un spectateur voit la table depuis le siège 0.
 */
export function seatOffset(seat: number, mySeat: number | null, count: number): number {
  return (seat - (mySeat ?? 0) + count) % count;
}
