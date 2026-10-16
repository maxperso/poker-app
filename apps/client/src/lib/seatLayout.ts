/** Position sur l'ellipse, en unités de rayon : (0, 0) = centre, x et y entre −1 et 1. */
export interface UnitPoint {
  x: number;
  y: number;
}

const cache = new Map<string, UnitPoint[]>();

/**
 * Répartit `count` places sur une ellipse de rayons `rx` × `ry`, à intervalles égaux
 * LE LONG DU BORD (et non à angles égaux) : sur une ellipse allongée, des angles égaux
 * tasseraient les places aux deux bouts. La place 0 est en bas au centre, les suivantes
 * tournent dans le sens des aiguilles d'une montre (sens du jeu : vers la gauche du joueur).
 */
export function ellipsePositions(count: number, rx: number, ry: number): UnitPoint[] {
  const key = `${count}:${(rx / ry).toFixed(3)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  // Échantillonne le bord à partir du bas (angle π/2, axe y vers le bas) et cumule les longueurs.
  const samples = 1440;
  const angles: number[] = [];
  const lengths: number[] = [0];
  for (let i = 0; i <= samples; i++) {
    const t = Math.PI / 2 + (i / samples) * 2 * Math.PI;
    angles.push(t);
    if (i > 0) {
      const prev = angles[i - 1] as number;
      const dx = rx * (Math.cos(t) - Math.cos(prev));
      const dy = ry * (Math.sin(t) - Math.sin(prev));
      lengths.push((lengths[i - 1] as number) + Math.hypot(dx, dy));
    }
  }
  const total = lengths[samples] as number;

  const points: UnitPoint[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while ((lengths[j + 1] as number) < target) j++;
    const t = angles[j] as number;
    points.push({ x: Math.cos(t), y: Math.sin(t) });
  }
  cache.set(key, points);
  return points;
}

/**
 * Rotation des places : le joueur local est toujours en bas au centre.
 * Renvoie, pour un siège réel, son indice d'affichage (0 = en bas).
 * Un spectateur voit la table depuis le siège 0.
 */
export function displayIndex(seat: number, mySeat: number | null, count: number): number {
  return (seat - (mySeat ?? 0) + count) % count;
}
