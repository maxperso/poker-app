import { describeHand, evaluateBest } from '@poker/engine';
import type { GameEvent, RoomView } from '@poker/shared';
import { useServerNow } from '../../hooks/useRoom';
import { formatChips } from '../../lib/format';
import type { StageLayout } from '../../lib/tableLayout';
import { Avatar } from './Avatar';
import { PlayingCard } from './PlayingCard';
import { TimerRing } from './TimerRing';

interface HeroProps {
  view: RoomView;
  events: GameEvent[];
  clockOffset: number;
  layout: StageLayout;
  winningCards: Set<string>;
  winnings: number;
}

/**
 * Le joueur local, toujours en bas au centre : ses deux cartes en grand, inclinées,
 * qui débordent sur le rebord ; dessous, son cartouche (avatar + timer, pseudo, stack).
 */
export function Hero({ view, events, clockOffset, layout, winningCards, winnings }: HeroProps) {
  const mySeat = view.you.seat;
  const seat = mySeat === null ? null : view.seats[mySeat];
  if (mySeat === null || !seat) return null;
  const me = view.members.find((m) => m.publicId === view.you.publicId);
  const hand = view.hand;
  const { hero } = layout;
  const cards = Array.isArray(seat.cards) ? seat.cards : null;

  const dealt = events.find((e) => e.type === 'holeCardsDealt');
  const order = dealt?.type === 'holeCardsDealt' ? dealt.seats : null;
  const index = order?.indexOf(mySeat) ?? -1;
  const delays = order && index >= 0 ? [index * 0.07, (order.length + index) * 0.07] : null;
  const dealFrom = {
    x: layout.focus.x - hero.cardsCx,
    y: layout.focus.y - (hero.cardsTop + hero.cardH / 2),
  };

  const myTurn =
    hand !== null && !hand.isComplete && hand.toAct === mySeat && view.turnDeadline !== null;
  const strength =
    cards && hand && hand.board.length >= 3
      ? describeHand(evaluateBest([...cards, ...hand.board]))
      : null;

  return (
    <>
      {cards && hand && (
        <div
          className="absolute z-30"
          style={{ left: 0, top: hero.cardsTop, width: layout.width, height: hero.cardH }}
        >
          {cards.map((card, i) => (
            <div
              key={`${hand.handNumber}-${i}`}
              className="absolute top-0"
              style={{
                left: hero.cardsCx + (i === 0 ? -hero.spread : hero.spread) - hero.cardW / 2,
              }}
            >
              <PlayingCard
                card={card}
                width={hero.cardW}
                height={hero.cardH}
                rotate={i === 0 ? -6 : 6}
                dimmed={seat.folded}
                highlighted={winningCards.has(card)}
                dealFrom={delays ? dealFrom : undefined}
                delay={delays?.[i] ?? 0}
              />
            </div>
          ))}
        </div>
      )}

      <div
        className={`absolute z-40 flex items-center gap-3 rounded-[14px] border-2 bg-surface px-3 transition-shadow ${
          myTurn || winnings > 0
            ? 'border-gold shadow-[0_0_24px_rgba(212,166,74,0.35)]'
            : 'border-gold-soft'
        }`}
        style={{ left: hero.panel.x, top: hero.panel.y, width: hero.panel.w, height: hero.panel.h }}
      >
        <TimerRing
          size={hero.panel.h - 20}
          deadline={myTurn ? view.turnDeadline : null}
          totalMs={view.config.turnSeconds * 1000}
          clockOffset={clockOffset}
        >
          <Avatar
            nickname={me?.nickname ?? '?'}
            color={me?.color ?? '#e8b04f'}
            size={hero.panel.h - 20}
          />
        </TimerRing>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 leading-none">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[17px] font-semibold text-text">{me?.nickname}</span>
            <HeroStatus
              myTurn={myTurn}
              deadline={view.turnDeadline}
              clockOffset={clockOffset}
              folded={seat.folded}
              sittingOut={seat.sittingOut}
              strength={strength}
            />
          </div>
          <span className="font-display tabular text-[26px] font-bold text-gold-amount">
            {seat.allIn ? 'Tapis' : formatChips(seat.stack)}
            {winnings > 0 && (
              <span className="ml-2 text-lg text-gold-light">+{formatChips(winnings)}</span>
            )}
          </span>
        </div>
      </div>
    </>
  );
}

function HeroStatus({
  myTurn,
  deadline,
  clockOffset,
  folded,
  sittingOut,
  strength,
}: {
  myTurn: boolean;
  deadline: number | null;
  clockOffset: number;
  folded: boolean;
  sittingOut: boolean;
  strength: string | null;
}) {
  if (myTurn && deadline !== null)
    return <TurnCountdown deadline={deadline} clockOffset={clockOffset} />;
  const text = sittingOut ? 'Absent' : folded ? 'Couché' : strength;
  return text ? <span className="truncate text-sm text-text-3">{text}</span> : null;
}

function TurnCountdown({ deadline, clockOffset }: { deadline: number; clockOffset: number }) {
  const now = useServerNow(clockOffset, 250);
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className={`shrink-0 text-sm font-medium ${seconds <= 5 ? 'text-danger' : 'text-text-2'}`}
    >
      À toi · {seconds} s
    </span>
  );
}
