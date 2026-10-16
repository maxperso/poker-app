import type { GameEvent, RoomView } from '@poker/shared';
import { formatChips } from './format';

/**
 * Traduit les événements reçus en lignes lisibles pour « Dernières actions ».
 * Les événements ne contiennent que des numéros de siège : on retrouve les pseudos
 * dans la vue reçue avec eux.
 */
export function describeEvents(events: GameEvent[], view: RoomView): string[] {
  const nameAt = (seat: number) => {
    const publicId = view.seats[seat]?.publicId;
    return view.members.find((m) => m.publicId === publicId)?.nickname ?? `Siège ${seat + 1}`;
  };
  const nameOf = (publicId: string) =>
    view.members.find((m) => m.publicId === publicId)?.nickname ?? 'Un joueur';

  const lines: string[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'handStarted':
        lines.push(`Main n°${event.handNumber}`);
        break;
      case 'playerActed': {
        const who = nameAt(event.seat);
        const amount = formatChips(event.amount);
        const allIn = event.allIn ? ' (tapis)' : '';
        const text = {
          fold: `${who} se couche`,
          check: `${who} parle`,
          call: `${who} suit ${amount}`,
          bet: `${who} mise ${amount}`,
          raise: `${who} relance à ${amount}`,
        }[event.action];
        lines.push(text + allIn);
        break;
      }
      case 'potAwarded':
        for (const winner of event.winners) {
          lines.push(`${nameAt(winner.seat)} remporte ${formatChips(winner.amount)}`);
        }
        break;
      case 'blindsIncreased':
        lines.push(`Les blinds passent à ${formatChips(event.small)} / ${formatChips(event.big)}`);
        break;
      case 'playerBusted':
        lines.push(`${nameOf(event.publicId)} n’a plus de jetons`);
        break;
      default:
        break;
    }
  }
  return lines;
}
