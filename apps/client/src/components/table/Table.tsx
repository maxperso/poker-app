import type { Card } from '@poker/engine';
import type { GameEvent, RoomView } from '@poker/shared';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useMemo, useRef } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { formatChips } from '../../lib/format';
import { displayIndex, ellipsePositions } from '../../lib/seatLayout';
import { Chips } from './Chips';
import { CardSlot, PlayingCard } from './PlayingCard';
import { EmptySeat, Seat } from './Seat';

interface TableProps {
  view: RoomView;
  events: GameEvent[];
  clockOffset: number;
  onSit: (seat: number) => void;
  /** Contenu affiché au centre sous le board (attente, compte à rebours…). */
  center: ReactNode;
}

const DEAL_STEP = 0.07;
const STREET_STEP = 0.8;

/**
 * La table vue de dessus. Tout est positionné en pixels à partir de la taille mesurée
 * du conteneur : tapis ovale centré, sièges répartis sur son bord, mises entre chaque
 * siège et le centre, board et pot au milieu. En portrait (téléphone), l'ovale est vertical.
 */
export function Table({ view, events, clockOffset, onSit, center }: TableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { width: w, height: h } = useElementSize(ref);
  const hand = view.hand;
  const seatCount = view.seats.length;
  const mySeat = view.you.seat;

  // --- Géométrie -------------------------------------------------------------------------
  const portrait = w < h;
  const aspect = portrait ? 0.62 : 2.05;
  const feltW = Math.max(
    0,
    Math.min(portrait ? w * 0.66 : w * 0.8, (portrait ? h * 0.8 : h * 0.66) * aspect),
  );
  const feltH = feltW / aspect;
  const rx = feltW / 2;
  const ry = feltH / 2;
  const cx = w / 2;
  const cy = h / 2;
  const plateW = Math.round(
    Math.min(160, Math.max(portrait ? 92 : 108, feltW * (portrait ? 0.3 : 0.135))),
  );
  const boardCardW = Math.round(Math.min(68, Math.max(30, portrait ? feltW * 0.15 : feltW * 0.07)));
  const boardCardH = Math.round(boardCardW * 1.4);
  const potY = cy - boardCardH / 2 - 22;

  const layout = useMemo(() => {
    const points = ellipsePositions(seatCount, rx || 1, ry || 1);
    return Array.from({ length: seatCount }, (_, seat) => {
      const p = points[displayIndex(seat, mySeat, seatCount)]!;
      const seatX = cx + p.x * rx * 1.03;
      const seatY = cy + p.y * ry * 1.05;
      const betX = cx + p.x * rx * 0.64;
      const betY = cy + p.y * ry * 0.6;
      // Bouton dealer : collé à la plaque de son joueur, côté tapis, et décalé sur le côté
      // pour ne pas recouvrir ses cartes (centrées sur la plaque).
      const toCenterLength = Math.hypot(cx - seatX, cy - seatY) || 1;
      const ux = (cx - seatX) / toCenterLength;
      const uy = (cy - seatY) / toCenterLength;
      const plateH = plateW * 0.36 + 8;
      const extent = (Math.abs(ux) * plateW) / 2 + (Math.abs(uy) * plateH) / 2;
      const sideways = Math.abs(ux) > Math.abs(uy);
      // Côtés gauche/droit : décalage vers le bas (les cartes sont au-dessus) ; haut/bas : vers la droite.
      let vx = -uy;
      let vy = ux;
      if ((sideways && vy < 0) || (!sideways && vx < 0)) {
        vx = -vx;
        vy = -vy;
      }
      const shift = sideways ? plateH * 0.55 : plateW * 0.42;
      const buttonX = seatX + ux * (extent + 14) + vx * shift;
      const buttonY = seatY + uy * (extent + 14) + vy * shift;
      return { p, seatX, seatY, betX, betY, buttonX, buttonY };
    });
  }, [seatCount, rx, ry, cx, cy, mySeat, plateW]);

  // --- Animations dérivées des événements du dernier message -----------------------------
  const animation = useMemo(() => {
    const dealt = events.find((e) => e.type === 'holeCardsDealt');
    const dealDelays = new Map<number, [number, number]>();
    if (dealt?.type === 'holeCardsDealt') {
      const order = dealt.seats;
      order.forEach((seat, index) => {
        dealDelays.set(seat, [index * DEAL_STEP, (order.length + index) * DEAL_STEP]);
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
  }, [events]);

  // --- Résultat de la main ---------------------------------------------------------------
  const result = hand?.isComplete ? hand.result : null;
  const winnings = new Map<number, number>();
  for (const award of result?.awards ?? []) {
    for (const winner of award.winners) {
      winnings.set(winner.seat, (winnings.get(winner.seat) ?? 0) + winner.amount);
    }
  }
  const showdown = new Map(result?.showdown.map((s) => [s.seat, s]) ?? []);
  const winningCards = new Set<string>(
    [...winnings.keys()].flatMap((seat) => showdown.get(seat)?.cards ?? []),
  );

  const dealer = view.buttonSeat === null ? undefined : layout[view.buttonSeat];
  const membersById = new Map(view.members.map((m) => [m.publicId, m]));
  const potTotal = hand?.pots.reduce((sum, pot) => sum + pot.amount, 0) ?? 0;

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {w > 0 && (
        <>
          {/* Tapis : bordure (rail) + feutrine avec un léger dégradé. */}
          <div
            className="absolute rounded-[50%]"
            style={{
              left: cx - rx - 14,
              top: cy - ry - 14,
              width: feltW + 28,
              height: feltH + 28,
              background: 'linear-gradient(180deg, var(--color-rail-light), var(--color-rail))',
              boxShadow: '0 30px 80px rgba(0,0,0,0.65), inset 0 2px 0 rgba(255,255,255,0.08)',
            }}
          />
          <div
            className="absolute rounded-[50%]"
            style={{
              left: cx - rx,
              top: cy - ry,
              width: feltW,
              height: feltH,
              background:
                'radial-gradient(ellipse at 50% 40%, var(--color-felt-light) 0%, var(--color-felt) 55%, var(--color-felt-dark) 100%)',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.55)',
            }}
          />
          <div
            className="pointer-events-none absolute rounded-[50%] border border-white/[0.07]"
            style={{
              left: cx - rx * 0.9,
              top: cy - ry * 0.86,
              width: feltW * 0.9,
              height: feltH * 0.86,
            }}
          />

          {/* Pot (déjà ramassé) au-dessus du board. */}
          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: cx, top: potY }}
          >
            <AnimatePresence>
              {potTotal > 0 && (
                <motion.div
                  key="pot"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-xs font-medium uppercase tracking-wider text-white/60">
                    Pot
                  </span>
                  <Chips amount={potTotal} size={16} />
                </motion.div>
              )}
            </AnimatePresence>
            {(hand?.pots.length ?? 0) > 1 && (
              <div className="tabular text-[11px] text-white/60">
                {hand!.pots
                  .map(
                    (pot, i) => (i === 0 ? 'Principal ' : `Side ${i} `) + formatChips(pot.amount),
                  )
                  .join(' · ')}
              </div>
            )}
          </div>

          {/* Board. */}
          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2"
            style={{ left: cx, top: cy, gap: Math.round(boardCardW * 0.12) }}
          >
            {Array.from({ length: 5 }, (_, i) => {
              const card = hand?.board[i];
              if (!card || !hand) return <CardSlot key={`slot-${i}`} width={boardCardW} />;
              const delay = animation.boardDelays.get(card);
              return (
                <PlayingCard
                  key={`${hand.handNumber}-${i}`}
                  card={card}
                  width={boardCardW}
                  flipIn={delay !== undefined}
                  delay={delay ?? 0}
                  highlighted={winningCards.has(card)}
                />
              );
            })}
          </div>

          {/* Messages au centre (attente, compte à rebours, résultat). */}
          <div
            className="absolute flex -translate-x-1/2 flex-col items-center gap-2 text-center"
            style={{ left: cx, top: cy + boardCardH / 2 + 12, width: Math.min(feltW * 0.8, 360) }}
          >
            {center}
          </div>

          {/* Mises devant chaque joueur : à la fin du tour d'enchères, elles glissent vers le pot. */}
          <AnimatePresence>
            {view.seats.map((seat, index) => {
              if (!seat || seat.bet <= 0 || !hand) return null;
              const { betX, betY } = layout[index]!;
              return (
                <motion.div
                  key={`${hand.handNumber}-${hand.street}-${index}`}
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: betX, top: betY }}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{
                    x: cx - betX,
                    y: potY - betY,
                    opacity: 0,
                    scale: 0.7,
                    transition: { duration: 0.45, ease: 'easeIn' },
                  }}
                >
                  <Chips amount={seat.bet} size={portrait ? 14 : 17} />
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Gains : les jetons partent du pot vers le(s) gagnant(s). */}
          {result &&
            hand &&
            [...winnings].map(([seat, amount]) => {
              const { seatX, seatY } = layout[seat]!;
              return (
                <motion.div
                  key={`${hand.handNumber}-win-${seat}`}
                  className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: cx, top: potY }}
                  initial={{ x: 0, y: 0, opacity: 0 }}
                  animate={{ x: seatX - cx, y: seatY - potY, opacity: [0, 1, 1, 0] }}
                  transition={{
                    delay: animation.awardDelay,
                    duration: 1.1,
                    ease: 'easeInOut',
                    opacity: {
                      times: [0, 0.1, 0.8, 1],
                      delay: animation.awardDelay,
                      duration: 1.1,
                    },
                  }}
                >
                  <Chips amount={amount} size={16} label={false} />
                </motion.div>
              );
            })}

          {/* Bouton dealer. */}
          {dealer && (
            <motion.div
              className="absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[11px] font-black text-ink shadow-md ring-2 ring-black/30"
              initial={false}
              animate={{ left: dealer.buttonX, top: dealer.buttonY }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
            >
              D
            </motion.div>
          )}

          {/* Sièges. */}
          {view.seats.map((seat, index) => {
            const { seatX, seatY, p } = layout[index]!;
            const isMe = index === mySeat;
            return (
              <div
                key={index}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: seatX, top: seatY }}
              >
                {seat ? (
                  <Seat
                    seat={seat}
                    member={membersById.get(seat.publicId)}
                    isMe={isMe}
                    width={plateW}
                    cardsBelow={p.y < -0.55}
                    toCenter={{ x: cx - seatX, y: cy - seatY }}
                    handNumber={seat.inHand && hand ? hand.handNumber : null}
                    dealDelays={animation.dealDelays.get(index) ?? null}
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
                  <EmptySeat width={plateW} canSit={mySeat === null} onSit={() => onSit(index)} />
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
