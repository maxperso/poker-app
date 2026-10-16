import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { type ReactNode, useEffect } from 'react';

interface TimerRingProps {
  /** Diamètre de l'avatar entouré. */
  size: number;
  /** Fin du tour en heure serveur (ms), ou null s'il n'y a pas de chrono. */
  deadline: number | null;
  totalMs: number;
  clockOffset: number;
  children: ReactNode;
}

/**
 * Anneau de timer autour de l'avatar : un `conic-gradient` or qui se vide.
 * Motion fait varier une valeur animée (pas un état React) : pas de re-rendu à chaque image.
 */
export function TimerRing({ size, deadline, totalMs, clockOffset, children }: TimerRingProps) {
  const thickness = Math.max(3, Math.round(size * 0.08));
  const progress = useMotionValue(1);
  const background = useTransform(
    progress,
    (p) => `conic-gradient(#d4a64a ${p * 360}deg, rgba(212,166,74,0.14) 0)`,
  );

  useEffect(() => {
    if (deadline === null) return;
    const remaining = Math.max(0, deadline - (Date.now() + clockOffset));
    progress.set(Math.min(1, remaining / totalMs));
    const controls = animate(progress, 0, { duration: remaining / 1000, ease: 'linear' });
    return () => controls.stop();
  }, [deadline, totalMs, clockOffset, progress]);

  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size + thickness * 2, height: size + thickness * 2 }}
    >
      {deadline !== null && (
        <motion.div className="absolute inset-0 rounded-full" style={{ background }} />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
