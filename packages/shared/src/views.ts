import type {
  Card,
  HandEvent,
  LegalActions,
  Pot,
  PotAward,
  ShowdownHand,
  Street,
} from '@poker/engine';
import type { RoomConfig } from './schemas';

export type RoomStatus = 'waiting' | 'playing';

/** Ligne de la liste des salons publics. */
export interface RoomSummary {
  id: string;
  name: string;
  /** Joueurs assis. */
  players: number;
  maxSeats: number;
  status: RoomStatus;
}

export interface MemberView {
  /** Identifiant public : le seul qui circule vers les autres joueurs (jamais le jeton secret). */
  publicId: string;
  nickname: string;
  color: string;
  connected: boolean;
  isHost: boolean;
  seat: number | null;
}

export interface SeatView {
  publicId: string;
  stack: number;
  sittingOut: boolean;
  /** A reçu des cartes à la main en cours (ou à la dernière main, tant qu'elle est affichée). */
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  /** Mise devant le joueur sur la rue en cours. */
  bet: number;
  /**
   * Ce que CE spectateur voit : ses propres cartes ou des cartes révélées,
   * 'hidden' pour deux cartes face cachée, null s'il n'a pas de cartes.
   */
  cards: [Card, Card] | 'hidden' | null;
}

export interface HandView {
  handNumber: number;
  street: Street;
  isComplete: boolean;
  board: Card[];
  /** Pots déjà ramassés au centre (les mises de la rue sont dans SeatView.bet). */
  pots: Pot[];
  currentBet: number;
  toAct: number | null;
  buttonSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  result: { awards: PotAward[]; showdown: ShowdownHand[] } | null;
}

export interface RoomView {
  id: string;
  name: string;
  status: RoomStatus;
  config: RoomConfig;
  members: MemberView[];
  seats: (SeatView | null)[];
  buttonSeat: number | null;
  hand: HandView | null;
  blinds: { small: number; big: number; level: number; nextLevelAt: number | null };
  /** Horodatages serveur (ms) : à corriger côté client avec serverNow. */
  turnDeadline: number | null;
  nextHandAt: number | null;
  you: {
    publicId: string;
    isHost: boolean;
    seat: number | null;
    /** Non null seulement quand c'est à vous de jouer. */
    legal: LegalActions | null;
    canRebuy: boolean;
  };
}

export type GameEvent =
  | HandEvent
  | { type: 'blindsIncreased'; level: number; small: number; big: number }
  | { type: 'playerBusted'; seat: number; publicId: string };

export interface RoomStateMessage {
  /** Incrémenté à chaque changement : le client ignore un message plus ancien que le dernier reçu. */
  seq: number;
  /** Heure du serveur à l'envoi, pour compenser le décalage d'horloge du client. */
  serverNow: number;
  view: RoomView;
  /** Ce qui s'est passé depuis le message précédent (pour les animations). Vide à la reconnexion. */
  events: GameEvent[];
}
