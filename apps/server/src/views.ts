import { collectedPots, legalActions } from '@poker/engine';
import type { HandView, MemberView, RoomView, SeatView } from '@poker/shared';
import type { Room } from './rooms/Room';

/**
 * Projette l'état complet du salon en ce que `token` a le droit de voir.
 *
 * C'est LE point de sécurité du jeu : tout ce qui part vers un client passe par ici.
 * Cartes privées : seulement les siennes, ou celles révélées à tous. Le paquet, les jetons
 * des autres membres et les identifiants internes ne sortent jamais.
 * On construit la vue champ par champ (liste blanche) plutôt que de retirer des champs
 * d'un objet existant : un champ ajouté plus tard au moteur ne fuira pas par accident.
 */
export function buildView(room: Room, token: string): RoomView {
  const me = room.members.get(token);
  if (!me) throw new Error('buildView : membre inconnu');
  const mySeat = room.seatOf(token);
  const hand = room.table.hand;

  const seats = room.table.seats.map((seat, index): SeatView | null => {
    if (!seat) return null;
    const player = hand?.players.find((p) => p.seat === index && p.id === seat.id);
    let cards: SeatView['cards'] = null;
    if (player) {
      if (index === mySeat || player.revealed) cards = [...player.holeCards];
      else if (!player.folded) cards = 'hidden';
    }
    return {
      publicId: seat.id,
      stack: seat.stack,
      sittingOut: seat.sittingOut,
      inHand: player !== undefined,
      folded: player?.folded ?? false,
      allIn: player !== undefined && !player.folded && player.stack === 0,
      bet: player?.bet ?? 0,
      cards,
    };
  });

  const members = [...room.members.values()].map((m): MemberView => ({
    publicId: m.publicId,
    nickname: m.nickname,
    color: m.color,
    connected: m.connections > 0,
    isHost: m.token === room.hostToken,
    seat: room.seatOf(m.token),
  }));

  const handView: HandView | null = hand && {
    handNumber: hand.handNumber,
    street: hand.street,
    isComplete: hand.isComplete,
    board: [...hand.board],
    pots: collectedPots(hand),
    currentBet: hand.currentBet,
    toAct: hand.toAct,
    buttonSeat: hand.buttonSeat,
    smallBlindSeat: hand.smallBlindSeat,
    bigBlindSeat: hand.bigBlindSeat,
    result: hand.result,
  };

  const legal = hand && mySeat !== null && hand.toAct === mySeat ? legalActions(hand) : null;

  return {
    id: room.id,
    name: room.config.name,
    status: room.status,
    config: room.config,
    members,
    seats,
    buttonSeat: room.table.buttonSeat,
    hand: handView,
    blinds: {
      ...room.currentBlinds(),
      level: room.blindLevel,
      nextLevelAt: room.nextBlindLevelAt(),
    },
    turnDeadline: room.turnDeadline,
    nextHandAt: room.nextHandAt,
    you: {
      publicId: me.publicId,
      isHost: token === room.hostToken,
      seat: mySeat,
      legal,
      canRebuy: mySeat !== null && room.canRebuy(mySeat),
    },
  };
}
