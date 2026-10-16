import { describeHand, evaluateBest } from '@poker/engine';
import type { GameEvent, RoomView } from '@poker/shared';
import { PlayingCard } from './PlayingCard';

interface HeroCardsProps {
  view: RoomView;
  events: GameEvent[];
  cardWidth: number;
}

/** Mes deux cartes, en grand en bas de l'écran, avec la force de ma main dès le flop. */
export function HeroCards({ view, events, cardWidth }: HeroCardsProps) {
  const seat = view.you.seat === null ? null : view.seats[view.you.seat];
  const hand = view.hand;
  if (!seat || !hand || !Array.isArray(seat.cards)) {
    return <div style={{ height: Math.round(cardWidth * 1.4) }} aria-hidden />;
  }
  const cards = seat.cards;
  const dealt = events.find((e) => e.type === 'holeCardsDealt');
  const order = dealt?.type === 'holeCardsDealt' ? dealt.seats : null;
  const index = order?.indexOf(view.you.seat!) ?? -1;
  const delays = order && index >= 0 ? [index * 0.07, (order.length + index) * 0.07] : null;

  // L'évaluateur du moteur tourne aussi côté client : il est pur, sans dépendance réseau.
  const strength =
    hand.board.length >= 3 ? describeHand(evaluateBest([...cards, ...hand.board])) : null;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex" style={{ gap: Math.round(cardWidth * 0.08) }}>
        {cards.map((card, i) => (
          <PlayingCard
            key={`${hand.handNumber}-${i}`}
            card={card}
            width={cardWidth}
            rotate={i === 0 ? -4 : 4}
            dimmed={seat.folded}
            dealFrom={delays ? { x: 0, y: -Math.round(cardWidth * 2.2) } : undefined}
            delay={delays?.[i] ?? 0}
          />
        ))}
      </div>
      <div className="h-5 text-sm font-medium text-white/80">
        {seat.folded ? 'Couché' : strength}
      </div>
    </div>
  );
}
