import type { Card } from '@poker/engine';
import { motion } from 'motion/react';

const BACK = '/cards/2B.svg';

interface PlayingCardProps {
  /** null = face cachée. Passer de null à une carte la retourne (abattage). */
  card: Card | null;
  width: number;
  /** Distribution : la carte part de ce décalage (px) et glisse jusqu'à sa place. */
  dealFrom?: { x: number; y: number };
  /** Apparition retournée : la carte arrive face cachée puis se retourne (board, mes cartes). */
  flipIn?: boolean;
  delay?: number;
  rotate?: number;
  dimmed?: boolean;
  highlighted?: boolean;
}

/**
 * Une carte en deux faces superposées (recto et verso dos à dos, `backface-visibility: hidden`).
 * La faire pivoter de 180° sur l'axe Y montre l'autre face : c'est l'animation de retournement.
 */
export function PlayingCard({
  card,
  width,
  dealFrom,
  flipIn = false,
  delay = 0,
  rotate = 0,
  dimmed = false,
  highlighted = false,
}: PlayingCardProps) {
  const height = Math.round(width * 1.4);
  const startsFaceDown = flipIn || dealFrom !== undefined;

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width, height, perspective: 800 }}
      initial={
        dealFrom ? { x: dealFrom.x, y: dealFrom.y, opacity: 0, scale: 0.5, rotate: 0 } : false
      }
      animate={{ x: 0, y: 0, opacity: dimmed ? 0.4 : 1, scale: 1, rotate }}
      transition={{ delay, type: 'spring', stiffness: 220, damping: 24 }}
    >
      <motion.div
        className="card-3d relative h-full w-full"
        initial={startsFaceDown ? { rotateY: 180 } : false}
        animate={{ rotateY: card ? 0 : 180, y: highlighted ? -Math.round(height * 0.12) : 0 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: startsFaceDown ? delay + 0.3 : 0 }}
      >
        <img
          src={card ? `/cards/${card}.svg` : BACK}
          alt={card ?? 'Carte cachée'}
          draggable={false}
          className="card-face absolute inset-0 h-full w-full select-none"
          style={{
            filter: highlighted
              ? 'drop-shadow(0 0 6px rgba(242,193,78,0.9))'
              : 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
          }}
        />
        <img
          src={BACK}
          alt=""
          draggable={false}
          className="card-face absolute inset-0 h-full w-full select-none"
          style={{
            transform: 'rotateY(180deg)',
            filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
          }}
        />
      </motion.div>
    </motion.div>
  );
}

/** Emplacement vide du board (contour discret). */
export function CardSlot({ width }: { width: number }) {
  return (
    <div
      className="shrink-0 rounded-[7%] border border-white/10 bg-black/10"
      style={{ width, height: Math.round(width * 1.4) }}
    />
  );
}
