import { type RefObject, useLayoutEffect, useState } from 'react';

/** Taille d'un élément, mise à jour quand il est redimensionné (fenêtre, rotation du téléphone). */
export function useElementSize(ref: RefObject<HTMLElement | null>): {
  width: number;
  height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
