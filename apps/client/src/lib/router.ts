import { useSyncExternalStore } from 'react';

/**
 * Routeur minimal : deux pages seulement (« / » et « /r/:id »), pas besoin d'une bibliothèque.
 * L'URL est la source de vérité ; on écoute « popstate » (boutons précédent/suivant)
 * et notre propre événement « navigate ».
 */
const NAVIGATE = 'app:navigate';

function subscribe(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  window.addEventListener(NAVIGATE, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(NAVIGATE, listener);
  };
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(path: string): void {
  if (path === window.location.pathname) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(NAVIGATE));
}

export const roomPath = (roomId: string) => `/r/${roomId}`;
export const roomUrl = (roomId: string) => `${window.location.origin}${roomPath(roomId)}`;

/** « /r/abc123 » → « abc123 », sinon null. */
export function matchRoom(path: string): string | null {
  return /^\/r\/([A-Za-z0-9_-]+)\/?$/.exec(path)?.[1] ?? null;
}
