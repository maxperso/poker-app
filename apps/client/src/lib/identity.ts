import { nicknameSchema, tokenSchema } from '@poker/shared';
import { useSyncExternalStore } from 'react';

/**
 * Identité sans compte : un jeton aléatoire généré une seule fois et gardé dans le navigateur.
 * Il sert à retrouver sa place après un rechargement. C'est un secret : quiconque le connaît
 * peut jouer à votre place, il ne quitte donc ce navigateur que vers le serveur.
 */
const TOKEN_KEY = 'poker.token';
const NICKNAME_KEY = 'poker.nickname';

// localStorage peut être indisponible (navigation privée stricte) : on garde une copie en mémoire.
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Mémoire seule : l'identité sera perdue au rechargement, le jeu reste utilisable.
  }
}

export function getToken(): string {
  const stored = read(TOKEN_KEY);
  if (stored && tokenSchema.safeParse(stored).success) return stored;
  // getRandomValues fonctionne aussi hors HTTPS (contrairement à crypto.randomUUID).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  write(TOKEN_KEY, token);
  return token;
}

const listeners = new Set<() => void>();

export function getNickname(): string | null {
  const stored = read(NICKNAME_KEY);
  return stored && nicknameSchema.safeParse(stored).success ? stored : null;
}

export function setNickname(nickname: string): void {
  write(NICKNAME_KEY, nickname.trim());
  for (const listener of listeners) listener();
}

/** Pseudo courant, réactif : les composants se mettent à jour quand il change. */
export function useNickname(): string | null {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getNickname);
}
