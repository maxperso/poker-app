import type { Card } from '@poker/engine';
import type { GameEvent, RoomView } from '@poker/shared';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { formatChips } from '../../lib/format';
import { along, type Point, type StageLayout, seatOffset } from '../../lib/tableLayout';
import { Bet, Chip } from './Chips';
import { CardSlot, PlayingCard } from './PlayingCard';
import { EmptySeat, Seat } from './Seat';

const DEAL_STEP = 0.07;
const STREET_STEP = 0.8;

/** Gains, mains montrées et cartes gagnantes de la main qui vient de se terminer. */
export function handOutcome(view: RoomView) {
  const result = view.hand?.isComplete ? view.hand.result : null;
  const winnings = new Map<number, number>();
  for (const award of result?.awards ?? []) {
    for (const w of award.winners) winnings.set(w.seat, (winnings.get(w.seat) ?? 0) + w.amount);
  }
  const showdown = new Map(result?.showdown.map((s) => [s.seat, s]) ?? []);
  const winningCards = new Set<string>(
    [...winnings.keys()].flatMap((seat) => showdown.get(seat)?.cards ?? []),
  );
  return { result, winnings, showdown, winningCards };
}

/** Retards d'animation déduits des événements du dernier message. */
function animationTimings(events: GameEvent[]) {
  const dealDelays = new Map<number, [number, number]>();
  const dealt = events.find((e) => e.type === 'holeCardsDealt');
  if (dealt?.type === 'holeCardsDealt') {
    dealt.seats.forEach((seat, i) => {
      dealDelays.set(seat, [i * DEAL_STEP, (dealt.seats.length + i) * DEAL_STEP]);
    });
  }
  const boardDelays = new Map<Card, number>();
  let streets = 0;
  for (const event of events) {
    if (event.type !== 'boardDealt') continue;
    event.cards.forEach((card, i) => boardDelays.set(card, streets * STREET_STEP + i * 0.12));
    streets++;
  }
  return { dealDelays, boardDelays, awardDelay: streets * STREET_STEP + 0.7 };
}

interface TableProps {
  view: RoomView;
  events: GameEvent[];
  clockOffset: number;
  layout: StageLayout;
  onSit: (seat: number) => void;
  /** À la place du pot (résultat de la main). */
  headline: ReactNode;
  /** Sous le board (attente, détail du résultat…). */
  center: ReactNode;
}

export function Table({ view, events, clockOffset, layout, onSit, headline, center }: TableProps) {
  const { table, board, seat: seatLayout } = layout;
  const hand = view.hand;
  const count = view.seats.length;
  const mySeat = view.you.seat;
  const timings = animationTimings(events);
  const { result, winnings, showdown, winningCards } = handOutcome(view);
  const membersById = new Map(view.members.map((m) => [m.publicId, m]));
  const potTotal = hand?.pots.reduce((sum, pot) => sum + pot.amount, 0) ?? 0;
  const radius = Math.min(table.width, table.height) / 2;
  const left = table.cx - table.width / 2;
  const top = table.cy - table.height / 2;

  /** Positions d'un siège réel : point d'ellipse, mise, bouton dealer. */
  const placeOf = (seat: number) => {
    const k = seatOffset(seat, mySeat, count);
    const point = layout.seatPoint(k, count);
    const isHero = k === 0 && mySeat !== null;
    // Le héros a ses grandes cartes devant lui : sa mise passe au-dessus, le bouton à gauche.
    const bet = along(point, layout.focus, isHero ? 0.55 : layout.betRatio);
    const dealer: Point = isHero
      ? {
          x: layout.hero.cardsCx - layout.hero.spread - layout.hero.cardW / 2 - 24,
          y: layout.hero.cardsTop + layout.hero.cardH * 0.3,
        }
      : along(point, layout.focus, layout.dealerRatio);
    return { k, point, bet, dealer, isHero };
  };

  return (
    <>
      {/* Table : rebord bois + liseré extérieur, tapis en dégradé, liseré intérieur. */}
      <div
        className="absolute"
        style={{
          left,
          top,
          width: table.width,
          height: table.height,
          borderRadius: radius,
          background: 'var(--color-wood)',
          boxShadow: '0 0 0 3px var(--color-wood-edge), 0 30px 70px rgba(0,0,0,0.6)',
        }}
      >
        <div
          className="absolute"
          style={{
            inset: table.rail,
            borderRadius: radius - table.rail,
            background:
              'radial-gradient(ellipse at 50% 45%, var(--color-felt-1) 0%, var(--color-felt-2) 60%, var(--color-felt-3) 100%)',
            boxShadow: 'inset 0 0 30px rgba(0,0,0,0.45)',
          }}
        />
        <div
          className="pointer-events-none absolute border border-white/[0.09]"
          style={{ inset: table.innerInset, borderRadius: radius - table.innerInset }}
        />
      </div>

      <div
        className={`font-display pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold uppercase text-white/[0.08] transition-opacity ${
          center ? 'opacity-0' : ''
        }`}
        style={{
          left: board.cx,
          top: layout.watermarkY,
          fontSize: layout.name === 'desktop' ? 30 : 18,
          letterSpacing: '0.5em',
        }}
      >
        Poker Interco
      </div>

      {/* Pot. */}
      <AnimatePresence>
        {potTotal > 0 && (
          <motion.div
            key="pot"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: board.cx, top: layout.potY }}
          >
            <span className="flex items-baseline gap-2 rounded-full bg-black/40 px-5 py-1.5">
              <span className="text-lg text-text-2">Pot</span>
              <span className="font-display tabular text-[28px] font-bold leading-none text-text">
                {formatChips(potTotal)}
              </span>
            </span>
            {hand && hand.pots.length > 1 && (
              <span className="tabular text-xs text-text-2">
                {hand.pots
                  .map(
                    (pot, i) => `${i === 0 ? 'Principal' : `Side ${i}`} ${formatChips(pot.amount)}`,
                  )
                  .join(' · ')}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cartes communes. */}
      <div
        data-testid="board"
        className="absolute flex -translate-x-1/2 -translate-y-1/2"
        style={{ left: board.cx, top: board.cy, gap: board.gap }}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const card = hand?.board[i];
          if (!card || !hand)
            return <CardSlot key={`slot-${i}`} width={board.cardW} height={board.cardH} />;
          const delay = timings.boardDelays.get(card);
          return (
            <PlayingCard
              key={`${hand.handNumber}-${i}`}
              card={card}
              width={board.cardW}
              height={board.cardH}
              flipIn={delay !== undefined}
              delay={delay ?? 0}
              highlighted={winningCards.has(card)}
            />
          );
        })}
      </div>

      {/* Résultat de la main, à la place du pot. */}
      {headline && (
        <div
          className="absolute z-40 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
          style={{ left: board.cx, top: layout.potY }}
        >
          {headline}
        </div>
      )}

      {/* Sous le board : attente, détail du résultat, compte à rebours. */}
      <div
        className="absolute z-40 flex -translate-x-1/2 flex-col items-center gap-2 text-center"
        style={{
          left: board.cx,
          top: board.cy + board.cardH / 2 + 16,
          width: Math.min(table.width - 80, 520),
        }}
      >
        {center}
      </div>

      {/* Mises du tour : à la fin du tour d'enchères, elles glissent vers le pot. */}
      <AnimatePresence>
        {view.seats.map((seat, index) => {
          if (!seat || seat.bet <= 0 || !hand) return null;
          const { bet } = placeOf(index);
          return (
            <motion.div
              key={`${hand.handNumber}-${hand.street}-${index}`}
              className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
              style={{ left: bet.x, top: bet.y }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={{
                x: board.cx - bet.x,
                y: layout.potY - bet.y,
                opacity: 0,
                scale: 0.7,
                transition: { duration: 0.45, ease: 'easeIn' },
              }}
            >
              <Bet amount={seat.bet} size={layout.name === 'desktop' ? 20 : 15} />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Gains : des jetons partent du pot vers chaque gagnant. */}
      {result &&
        hand &&
        [...winnings].map(([seat]) => {
          const { point, isHero } = placeOf(seat);
          const target = isHero
            ? { x: layout.hero.panel.x + 40, y: layout.hero.panel.y + 30 }
            : point;
          return (
            <motion.div
              key={`${hand.handNumber}-win-${seat}`}
              className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-1/2"
              style={{ left: board.cx, top: layout.potY }}
              initial={{ x: 0, y: 0, opacity: 0 }}
              animate={{ x: target.x - board.cx, y: target.y - layout.potY, opacity: [0, 1, 1, 0] }}
              transition={{
                delay: timings.awardDelay,
                duration: 1.1,
                ease: 'easeInOut',
                opacity: { times: [0, 0.1, 0.8, 1], delay: timings.awardDelay, duration: 1.1 },
              }}
            >
              <div className="flex -space-x-2">
                <Chip size={22} />
                <Chip size={22} />
                <Chip size={22} />
              </div>
            </motion.div>
          );
        })}

      {/* Bouton dealer : entre le joueur et le centre, plus près du joueur que sa mise. */}
      {view.buttonSeat !== null && view.seats[view.buttonSeat] && (
        <motion.div
          className="absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#f6f3ea] font-display font-bold text-on-gold shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
          style={{ width: 28, height: 28, fontSize: 15 }}
          initial={false}
          animate={{
            left: placeOf(view.buttonSeat).dealer.x,
            top: placeOf(view.buttonSeat).dealer.y,
          }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        >
          D
        </motion.div>
      )}

      {/* Sièges des adversaires (et de tous, pour un spectateur). */}
      {view.seats.map((seat, index) => {
        const { point, isHero } = placeOf(index);
        if (isHero) return null;
        const boxLeft = point.x - seatLayout.width / 2;
        const boxTop = point.y - seatLayout.anchorY;
        return (
          <div key={index} className="absolute z-20" style={{ left: boxLeft, top: boxTop }}>
            {seat ? (
              <Seat
                seat={seat}
                member={membersById.get(seat.publicId)}
                layout={seatLayout}
                toCenter={{ x: layout.focus.x - point.x, y: layout.focus.y - point.y }}
                handNumber={seat.inHand && hand ? hand.handNumber : null}
                dealDelays={timings.dealDelays.get(index) ?? null}
                turn={
                  hand && !hand.isComplete && hand.toAct === index && view.turnDeadline !== null
                    ? {
                        deadline: view.turnDeadline,
                        totalMs: view.config.turnSeconds * 1000,
                        clockOffset,
                      }
                    : null
                }
                handName={showdown.get(index)?.name ?? null}
                winnings={winnings.get(index) ?? 0}
                bestCards={winnings.has(index) ? (showdown.get(index)?.cards ?? []) : []}
              />
            ) : (
              <EmptySeat layout={seatLayout} canSit={mySeat === null} onSit={() => onSit(index)} />
            )}
          </div>
        );
      })}
    </>
  );
}
