import type { Card } from '@poker/engine';
import { motion } from 'motion/react';

interface PlayingCardProps {
  /** null = face cachée. Passer de null à une carte la retourne (abattage). */
  card: Card | null;
  width: number;
  height: number;
  /** Distribution : la carte part de ce décalage (px) et glisse jusqu'à sa place. */
  dealFrom?: { x: number; y: number };
  /** La carte arrive face cachée puis se retourne (board, mes cartes). */
  flipIn?: boolean;
  delay?: number;
  rotate?: number;
  dimmed?: boolean;
  highlighted?: boolean;
}

/**
 * Une carte en deux faces dos à dos (`backface-visibility: hidden`) : la faire pivoter
 * de 180° sur l'axe Y montre l'autre face. Recto : SVG fourni ; verso : rayures de la charte.
 */
export function PlayingCard({
  card,
  width,
  height,
  dealFrom,
  flipIn = false,
  delay = 0,
  rotate = 0,
  dimmed = false,
  highlighted = false,
}: PlayingCardProps) {
  const startsFaceDown = flipIn || dealFrom !== undefined;
  const radius = Math.max(3, Math.round(width * 0.07));

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width, height, perspective: 900 }}
      initial={
        dealFrom ? { x: dealFrom.x, y: dealFrom.y, opacity: 0, scale: 0.5, rotate: 0 } : false
      }
      animate={{ x: 0, y: 0, opacity: dimmed ? 0.4 : 1, scale: 1, rotate }}
      transition={{ delay, type: 'spring', stiffness: 220, damping: 24 }}
    >
      <motion.div
        className="card-3d relative h-full w-full"
        initial={startsFaceDown ? { rotateY: 180 } : false}
        animate={{ rotateY: card ? 0 : 180, y: highlighted ? -Math.round(height * 0.1) : 0 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: startsFaceDown ? delay + 0.3 : 0 }}
      >
        <div
          className="card-face absolute inset-0 overflow-hidden bg-[#fbfaf6]"
          style={{
            borderRadius: radius,
            boxShadow: highlighted
              ? '0 0 0 2px #d4a64a, 0 0 18px rgba(212,166,74,0.55)'
              : '0 4px 10px rgba(0,0,0,0.45)',
          }}
        >
          {card && (
            <img
              src={`/cards/${card}.svg`}
              alt={card}
              draggable={false}
              className="h-full w-full select-none"
            />
          )}
        </div>
        <div
          className="card-face card-back absolute inset-0"
          style={{
            borderRadius: radius,
            transform: 'rotateY(180deg)',
            boxShadow: '0 3px 8px rgba(0,0,0,0.45)',
          }}
          aria-label={card ? undefined : 'Carte cachée'}
        />
      </motion.div>
    </motion.div>
  );
}

/** Emplacement du board pas encore distribué : contour pointillé blanc à 20 %. */
export function CardSlot({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="shrink-0 border-2 border-dashed border-white/20"
      style={{ width, height, borderRadius: Math.round(width * 0.08) }}
    />
  );
}
