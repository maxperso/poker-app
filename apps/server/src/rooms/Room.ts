import {
  act,
  addChips,
  type Blinds,
  createTable,
  dealableSeats,
  defaultAction,
  isHandInProgress,
  isInHand,
  type PlayerAction,
  type RandomInt,
  setSittingOut,
  sitDown,
  standUp,
  startNextHand,
  type TableOutcome,
  type TableState,
} from '@poker/engine';
import {
  type Ack,
  avatarColor,
  blindsForLevel,
  type ErrorCode,
  type GameEvent,
  type RoomConfig,
  type RoomStatus,
  type RoomSummary,
  sameNickname,
} from '@poker/shared';

export interface Member {
  /** Jeton secret du navigateur : identifie le joueur, ne doit jamais être envoyé aux autres. */
  token: string;
  /** Identifiant public, utilisé dans la table et dans les vues. */
  publicId: string;
  nickname: string;
  color: string;
  joinedAt: number;
  /** Connexions ouvertes (plusieurs onglets possibles). */
  connections: number;
  disconnectedAt: number | null;
  /** Départ demandé pendant une main où il joue : appliqué à la fin de la main. */
  leaving: 'seat' | 'room' | null;
}

export interface RoomDeps {
  randomInt: RandomInt;
  now: () => number;
  createId: (size: number) => string;
  /** Appelé après chaque changement d'état, avec les événements produits depuis le précédent. */
  onChange: (room: Room, events: GameEvent[]) => void;
}

/** Pauses entre deux mains, le temps de voir ce qui s'est passé. */
export const DELAYS = { afterFold: 2_500, afterShowdown: 6_000, resume: 1_500 };

const OK: Ack = { ok: true };
const fail = (error: ErrorCode): Ack => ({ ok: false, error });

/**
 * Un salon : ses membres (assis ou spectateurs), la table du moteur et les minuteries.
 *
 * Le salon ne connaît pas Socket.io. Il reçoit des commandes (join, act...) qui renvoient
 * un Ack, et signale chaque changement via `onChange`. La couche réseau décide quoi
 * envoyer à qui. On peut donc le tester sans serveur, avec de fausses horloges.
 */
export class Room {
  status: RoomStatus = 'waiting';
  table: TableState;
  readonly members = new Map<string, Member>();
  hostToken: string | null;
  seq = 0;
  turnDeadline: number | null = null;
  nextHandAt: number | null = null;
  blindLevel = 0;
  readonly createdAt: number;
  /** Depuis quand le salon n'a plus aucun membre (pour le supprimer). */
  emptySince: number | null;

  private gameStartedAt: number | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private nextHandTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: GameEvent[] = [];

  constructor(
    readonly id: string,
    readonly config: RoomConfig,
    creatorToken: string,
    private readonly deps: RoomDeps,
  ) {
    this.table = createTable(config.maxSeats);
    this.hostToken = creatorToken;
    this.createdAt = deps.now();
    this.emptySince = this.createdAt;
  }

  // --- Commandes -------------------------------------------------------------------------

  /** Entrer dans le salon, ou y revenir (même jeton → même place, pseudo éventuellement changé). */
  join(token: string, nickname: string): Ack {
    return this.mutate(() => {
      const taken = [...this.members.values()].some(
        (m) => m.token !== token && sameNickname(m.nickname, nickname),
      );
      if (taken) return fail('NICKNAME_TAKEN');

      const existing = this.members.get(token);
      if (existing) {
        existing.nickname = nickname;
        existing.color = avatarColor(nickname);
        // Revenir annule un départ demandé pendant la main (ex. rechargement de la page).
        existing.leaving = null;
      } else {
        this.members.set(token, {
          token,
          publicId: this.deps.createId(8),
          nickname,
          color: avatarColor(nickname),
          joinedAt: this.deps.now(),
          connections: 0,
          disconnectedAt: this.deps.now(),
          leaving: null,
        });
      }
      this.emptySince = null;
      return OK;
    });
  }

  /** Quitter le salon. Si on joue la main en cours, on se couche et on part à la fin de la main. */
  leave(token: string): Ack {
    return this.mutate(() => {
      const member = this.members.get(token);
      if (!member) return fail('NOT_IN_ROOM');
      const seat = this.seatOf(token);
      if (seat !== null && isInHand(this.table, seat)) {
        member.leaving = 'room';
        this.foldIfLeavingAndToAct();
        return OK;
      }
      if (seat !== null) this.applyTable(standUp(this.table, seat));
      this.removeMember(member);
      return OK;
    });
  }

  connect(token: string): void {
    const member = this.members.get(token);
    if (!member) return;
    member.connections++;
    member.disconnectedAt = null;
    this.commit();
  }

  disconnect(token: string): void {
    const member = this.members.get(token);
    if (!member) return;
    member.connections = Math.max(0, member.connections - 1);
    if (member.connections === 0) member.disconnectedAt = this.deps.now();
    this.commit();
  }

  takeSeat(token: string, seat: number): Ack {
    return this.mutate(() => {
      const member = this.members.get(token);
      if (!member) return fail('NOT_IN_ROOM');
      if (this.seatOf(token) !== null) return fail('ALREADY_SEATED');
      const result = this.applyTable(
        sitDown(this.table, seat, member.publicId, this.config.startingStack),
      );
      if (result.ok) this.maybeResume();
      return result;
    });
  }

  leaveSeat(token: string): Ack {
    return this.mutate(() => {
      const member = this.members.get(token);
      if (!member) return fail('NOT_IN_ROOM');
      const seat = this.seatOf(token);
      if (seat === null) return fail('NOT_SEATED');
      if (isInHand(this.table, seat)) {
        member.leaving = 'seat';
        this.foldIfLeavingAndToAct();
        return OK;
      }
      return this.applyTable(standUp(this.table, seat));
    });
  }

  /** L'hôte lance la partie. */
  start(token: string): Ack {
    return this.mutate(() => {
      if (token !== this.hostToken) return fail('NOT_HOST');
      if (this.status !== 'waiting') return fail('ALREADY_STARTED');
      if (dealableSeats(this.table).length < 2) return fail('NOT_ENOUGH_PLAYERS');
      this.status = 'playing';
      this.gameStartedAt = this.deps.now();
      this.startHand();
      return OK;
    });
  }

  act(token: string, handNumber: number, action: PlayerAction): Ack {
    return this.mutate(() => {
      const seat = this.seatOf(token);
      if (seat === null) return fail('NOT_SEATED');
      if (this.table.hand?.handNumber !== handNumber) return fail('STALE_HAND');
      return this.applyAction(seat, action);
    });
  }

  /** Recave : seulement si le salon l'autorise et que le joueur n'a plus de jetons. */
  rebuy(token: string): Ack {
    return this.mutate(() => {
      const seat = this.seatOf(token);
      if (seat === null) return fail('NOT_SEATED');
      if (!this.canRebuy(seat)) return fail('CANNOT_REBUY');
      const result = this.applyTable(addChips(this.table, seat, this.config.startingStack));
      if (result.ok) this.maybeResume();
      return result;
    });
  }

  setSittingOut(token: string, sittingOut: boolean): Ack {
    return this.mutate(() => {
      const seat = this.seatOf(token);
      if (seat === null) return fail('NOT_SEATED');
      const result = this.applyTable(setSittingOut(this.table, seat, sittingOut));
      if (!result.ok) return result;
      if (sittingOut) this.playForAbsentIfToAct();
      else this.maybeResume();
      return OK;
    });
  }

  // --- Lecture ---------------------------------------------------------------------------

  seatOf(token: string): number | null {
    const member = this.members.get(token);
    if (!member) return null;
    const seat = this.table.seats.findIndex((s) => s?.id === member.publicId);
    return seat === -1 ? null : seat;
  }

  memberByPublicId(publicId: string): Member | undefined {
    return [...this.members.values()].find((m) => m.publicId === publicId);
  }

  canRebuy(seat: number): boolean {
    return (
      this.config.onBust === 'rebuy' &&
      this.table.seats[seat]?.stack === 0 &&
      !isInHand(this.table, seat)
    );
  }

  currentBlinds(): Blinds {
    return blindsForLevel(this.config.blinds, this.blindLevel);
  }

  nextBlindLevelAt(): number | null {
    const every = this.config.blinds.increaseEveryMinutes;
    if (every === null || this.gameStartedAt === null) return null;
    return this.gameStartedAt + (this.blindLevel + 1) * every * 60_000;
  }

  summary(): RoomSummary {
    const seated = this.table.seats.flatMap((seat) => {
      const member = seat ? this.memberByPublicId(seat.id) : undefined;
      return member ? [{ nickname: member.nickname, color: member.color }] : [];
    });
    return {
      id: this.id,
      name: this.config.name,
      players: seated.length,
      maxSeats: this.config.maxSeats,
      status: this.status,
      blinds: { small: this.config.blinds.small, big: this.config.blinds.big },
      startingStack: this.config.startingStack,
      preview: seated.slice(0, 3),
    };
  }

  /** Arrête les minuteries (salon supprimé, serveur arrêté). */
  dispose(): void {
    this.clearTurnTimer();
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;
  }

  // --- Déroulé du jeu --------------------------------------------------------------------

  private startHand(): void {
    if (isHandInProgress(this.table) || dealableSeats(this.table).length < 2) return;
    const blinds = this.updateBlindLevel();
    const result = this.applyTable(startNextHand(this.table, blinds, this.deps.randomInt));
    if (result.ok) this.afterTableChange();
  }

  private applyAction(seat: number, action: PlayerAction): Ack {
    const result = this.applyTable(act(this.table, seat, action));
    if (result.ok) this.afterTableChange();
    return result;
  }

  /** Après chaque action : main finie ? joueur absent à faire jouer ? sinon, lancer son chrono. */
  private afterTableChange(): void {
    this.clearTurnTimer();
    const hand = this.table.hand;
    if (!hand) return;
    if (hand.isComplete) return this.onHandComplete();
    if (this.foldIfLeavingAndToAct() || this.playForAbsentIfToAct()) return;

    const seat = hand.toAct as number;
    const handNumber = hand.handNumber;
    const delay = this.config.turnSeconds * 1000;
    this.turnDeadline = this.deps.now() + delay;
    this.turnTimer = setTimeout(() => this.onTurnTimeout(handNumber, seat), delay);
  }

  private onTurnTimeout(handNumber: number, seat: number): void {
    this.turnTimer = null;
    const hand = this.table.hand;
    if (!hand || hand.isComplete || hand.handNumber !== handNumber || hand.toAct !== seat) return;
    // Déconnecté : on le met absent pour ne pas faire attendre la table à chaque main.
    if (this.memberAtSeat(seat)?.connections === 0) {
      this.applyTable(setSittingOut(this.table, seat, true));
    }
    this.applyAction(seat, defaultAction(hand));
    this.commit();
  }

  /** Le joueur à qui c'est le tour veut partir : il se couche tout de suite. */
  private foldIfLeavingAndToAct(): boolean {
    const hand = this.table.hand;
    if (!hand || hand.isComplete || hand.toAct === null) return false;
    if (!this.memberAtSeat(hand.toAct)?.leaving) return false;
    this.applyAction(hand.toAct, { type: 'fold' });
    return true;
  }

  /** Le joueur à qui c'est le tour est absent : parole si possible, sinon il se couche. */
  private playForAbsentIfToAct(): boolean {
    const hand = this.table.hand;
    if (!hand || hand.isComplete || hand.toAct === null) return false;
    if (!this.table.seats[hand.toAct]?.sittingOut) return false;
    this.applyAction(hand.toAct, defaultAction(hand));
    return true;
  }

  private onHandComplete(): void {
    this.turnDeadline = null;
    for (const member of [...this.members.values()]) {
      const seat = this.seatOf(member.token);
      if (seat === null) continue;
      if (member.leaving) {
        this.applyTable(standUp(this.table, seat));
        if (member.leaving === 'room') this.removeMember(member);
        else member.leaving = null;
      } else if (this.table.seats[seat]?.stack === 0) {
        this.pending.push({ type: 'playerBusted', seat, publicId: member.publicId });
        if (this.config.onBust === 'spectate') this.applyTable(standUp(this.table, seat));
      }
    }
    const hadShowdown = (this.table.hand?.result?.showdown.length ?? 0) > 0;
    this.scheduleNextHand(hadShowdown ? DELAYS.afterShowdown : DELAYS.afterFold);
  }

  private scheduleNextHand(delay: number): void {
    if (this.status !== 'playing' || this.nextHandTimer) return;
    this.nextHandAt = this.deps.now() + delay;
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.nextHandAt = null;
      // Pas assez de joueurs : la partie est en pause, maybeResume la relancera.
      this.startHand();
      this.commit();
    }, delay);
  }

  /** Partie en pause faute de joueurs : on relance dès qu'il y en a assez. */
  private maybeResume(): void {
    if (
      this.status === 'playing' &&
      !isHandInProgress(this.table) &&
      dealableSeats(this.table).length >= 2
    ) {
      this.scheduleNextHand(DELAYS.resume);
    }
  }

  /** Blinds croissantes : le niveau dépend du temps écoulé depuis le début de la partie. */
  private updateBlindLevel(): Blinds {
    const every = this.config.blinds.increaseEveryMinutes;
    if (every !== null && this.gameStartedAt !== null) {
      const level = Math.floor((this.deps.now() - this.gameStartedAt) / (every * 60_000));
      if (level > this.blindLevel) {
        this.blindLevel = level;
        this.pending.push({ type: 'blindsIncreased', level, ...this.currentBlinds() });
      }
    }
    return this.currentBlinds();
  }

  // --- Utilitaires -----------------------------------------------------------------------

  private applyTable(outcome: TableOutcome): Ack {
    if (!outcome.ok) return fail(outcome.error);
    this.table = outcome.table;
    this.pending.push(...outcome.events);
    return OK;
  }

  private memberAtSeat(seat: number): Member | undefined {
    const id = this.table.seats[seat]?.id;
    return id === undefined ? undefined : this.memberByPublicId(id);
  }

  private removeMember(member: Member): void {
    this.members.delete(member.token);
    if (this.hostToken === member.token) {
      // L'hôte part : le membre le plus ancien prend le relais. Salon vide : l'hôte reste
      // l'hôte, pour retrouver son rôle s'il revient (ex. retour arrière puis lien).
      const next = [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) this.hostToken = next.token;
    }
    if (this.members.size === 0) this.emptySince = this.deps.now();
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnDeadline = null;
  }

  /** Exécute une commande ; s'il s'est passé quelque chose, prévient la couche réseau. */
  private mutate(command: () => Ack): Ack {
    const result = command();
    if (result.ok || this.pending.length > 0) this.commit();
    return result;
  }

  private commit(): void {
    this.seq++;
    const events = this.pending;
    this.pending = [];
    this.deps.onChange(this, events);
  }
}
