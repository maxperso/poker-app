import type { ClientError } from './socket';

const chips = new Intl.NumberFormat('fr-FR');

/** 1250 → « 1 250 » */
export function formatChips(amount: number): string {
  return chips.format(amount);
}

const ERRORS: Record<ClientError, string> = {
  TIMEOUT: 'Le serveur ne répond pas. Vérifie ta connexion.',
  INTERNAL_ERROR: 'Erreur du serveur. Réessaie.',
  INVALID_INPUT: 'Informations invalides.',
  ROOM_NOT_FOUND: 'Ce salon n’existe pas (ou plus).',
  NICKNAME_TAKEN: 'Ce pseudo est déjà pris dans ce salon.',
  NOT_IN_ROOM: 'Tu n’es pas dans ce salon.',
  NOT_HOST: 'Seul l’hôte peut faire ça.',
  ALREADY_STARTED: 'La partie a déjà commencé.',
  STALE_HAND: 'Cette main est terminée.',
  CANNOT_REBUY: 'Recave impossible pour le moment.',
  INVALID_SEAT: 'Place invalide.',
  SEAT_TAKEN: 'Cette place vient d’être prise.',
  ALREADY_SEATED: 'Tu es déjà assis.',
  NOT_SEATED: 'Tu n’es pas assis.',
  INVALID_AMOUNT: 'Montant invalide.',
  IN_HAND: 'Impossible pendant une main.',
  HAND_IN_PROGRESS: 'Une main est en cours.',
  NOT_ENOUGH_PLAYERS: 'Il faut au moins 2 joueurs assis.',
  NO_HAND: 'Aucune main en cours.',
  HAND_COMPLETE: 'La main est terminée.',
  NOT_YOUR_TURN: 'Ce n’est pas ton tour.',
  CANNOT_CHECK: 'Impossible de parler : il y a une mise à suivre.',
  NOTHING_TO_CALL: 'Rien à suivre.',
  CANNOT_RAISE: 'Relance impossible.',
};

export function errorMessage(error: ClientError): string {
  return ERRORS[error];
}
