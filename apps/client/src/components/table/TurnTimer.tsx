import { motion } from 'motion/react';
import { useState } from 'react';

interface TurnTimerProps {
  /** Diamètre extérieur (px). */
  size: number;
  /** Fin du tour, en heure serveur (ms). */
  deadline: number;
  totalMs: number;
  clockOffset: number;
}

/**
 * Anneau qui se vide autour de l'avatar du joueur dont c'est le tour.
 * On calcule une seule fois, au montage, où en est le chrono (en heure serveur),
 * puis Motion anime le reste en continu : pas de re-rendu React à chaque image.
 */
export function TurnTimer({ size, deadline, totalMs, clockOffset }: TurnTimerProps) {
  const [{ fraction, remainingMs }] = useState(() => {
    const remaining = Math.max(0, deadline - (Date.now() + clockOffset));
    return { fraction: Math.min(1, remaining / totalMs), remainingMs: remaining };
  });
  const stroke = Math.max(3, size * 0.07);
  const r = (size - stroke) / 2;

  return (
    <svg
      width={size}
      height={size}
      className="pointer-events-none absolute -rotate-90"
      style={{ left: '50%', top: '50%', marginLeft: -size / 2, marginTop: -size / 2 }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={{ pathLength: fraction, stroke: fraction > 0.3 ? '#fbbf24' : '#ef4444' }}
        animate={{ pathLength: 0, stroke: '#ef4444' }}
        transition={{
          pathLength: { duration: remainingMs / 1000, ease: 'linear' },
          stroke: { duration: remainingMs / 1000, ease: (t) => (t < 0.7 ? 0 : (t - 0.7) / 0.3) },
        }}
      />
    </svg>
  );
}
