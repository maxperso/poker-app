import { type ReactNode, useRef } from 'react';
import { useElementSize } from '../hooks/useElementSize';

interface StageProps {
  width: number;
  height: number;
  children: ReactNode;
}

/**
 * Scène de taille fixe (ex. 1280×800) mise à l'échelle pour tenir dans la fenêtre,
 * centrée, proportions conservées. Tout ce qu'elle contient est positionné en pixels
 * « de maquette » : le rendu est identique quelle que soit la taille de l'écran.
 */
export function Stage({ width, height, children }: StageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  const scale = size.width > 0 ? Math.min(size.width / width, size.height / height) : 0;

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {scale > 0 && (
        <div
          className="absolute"
          style={{
            width,
            height,
            left: (size.width - width * scale) / 2,
            top: (size.height - height * scale) / 2,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
