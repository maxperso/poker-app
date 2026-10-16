import type { MemberView, SeatView } from '@poker/shared';
import { AnimatePresence, motion } from 'motion/react';
import { formatChips } from '../../lib/format';
import type { StageLayout } from '../../lib/tableLayout';
import { Avatar } from './Avatar';
import { PlayingCard } from './PlayingCard';
import { TimerRing } from './TimerRing';

export interface SeatProps {
  seat: SeatView;
  member: MemberView | undefined;
  layout: StageLayout['seat'];
  /** Vecteur de la boîte du siège vers le centre de la table (distribution). */
  toCenter: { x: number; y: number };
  handNumber: number | null;
  dealDelays: [number, number] | null;
  turn: { deadline: number; totalMs: number; clockOffset: number } | null;
  /** Abattage : nom de la main et gain. */
  handName: string | null;
  winnings: number;
  bestCards: string[];
}

/**
 * Siège d'un adversaire (DESIGN.md §2) : avatar en haut, deux petits dos de carte
 * s'il est encore dans le coup, cartouche pseudo + stack en dessous.
 */
export function Seat({
  seat,
  member,
  layout,
  toCenter,
  handNumber,
  dealDelays,
  turn,
  handName,
  winnings,
  bestCards,
}: SeatProps) {
  const nickname = member?.nickname ?? '…';
  const away = seat.sittingOut || (member !== undefined && !member.connected);
  const revealed = Array.isArray(seat.cards) ? seat.cards : null;
  const opacity = seat.folded ? 0.4 : away ? 0.6 : 1;
  const highlight = turn !== null || winnings > 0;

  return (
    <motion.div
      className="relative"
      style={{ width: layout.width, height: layout.height }}
      animate={{ opacity }}
      transition={{ duration: 0.3 }}
    >
      {/* Avatar (avec anneau de timer à son tour). */}
      <div
        className="absolute left-1/2 top-0 z-20 -translate-x-1/2"
        style={{ marginTop: turn ? -4 : 0 }}
      >
        <TimerRing
          size={layout.avatar}
          deadline={turn?.deadline ?? null}
          totalMs={turn?.totalMs ?? 1}
          clockOffset={turn?.clockOffset ?? 0}
        >
          <Avatar nickname={nickname} color={member?.color ?? '#8f8a7c'} size={layout.avatar} />
        </TimerRing>
      </div>

      {/* Deux petits dos de carte, en haut à droite de l'avatar. */}
      {seat.cards === 'hidden' && handNumber !== null && (
        <div
          className="absolute z-0"
          style={{ left: layout.width / 2 + layout.avatar * 0.18, top: -layout.avatar * 0.12 }}
        >
          {[0, 1].map((i) => (
            <div
              key={`${handNumber}-${i}`}
              className="absolute"
              style={{ left: i * layout.cardW * 0.42, top: i * 2 }}
            >
              <PlayingCard
                card={null}
                width={layout.cardW}
                height={layout.cardH}
                rotate={8 + i * 6}
                dealFrom={dealDelays ? toCenter : undefined}
                delay={dealDelays?.[i] ?? 0}
              />
            </div>
          ))}
        </div>
      )}

      {/* Cartes révélées (abattage) : par-dessus l'avatar, face visible. */}
      {revealed && handNumber !== null && (
        <div
          className="absolute left-1/2 z-20 flex -translate-x-1/2"
          style={{ top: -layout.cardH * 0.55, gap: 4 }}
        >
          {revealed.map((card, i) => (
            <PlayingCard
              key={`${handNumber}-${i}`}
              card={card}
              width={Math.round(layout.cardW * 1.45)}
              height={Math.round(layout.cardH * 1.45)}
              rotate={i === 0 ? -5 : 5}
              dimmed={seat.folded}
              highlighted={bestCards.includes(card)}
            />
          ))}
        </div>
      )}

      {/* Cartouche pseudo + stack. */}
      <div
        className={`absolute inset-x-0 z-10 flex flex-col items-center justify-center rounded-[10px] border bg-surface text-center leading-none transition-shadow ${
          highlight ? 'border-gold shadow-[0_0_18px_rgba(212,166,74,0.35)]' : 'border-gold-soft'
        }`}
        style={{ top: layout.plateTop, height: layout.plateHeight, gap: 3 }}
      >
        <span
          className="max-w-full truncate px-2 font-semibold text-text"
          style={{ fontSize: layout.name }}
        >
          {nickname}
        </span>
        {seat.allIn ? (
          <span
            className="font-display rounded-full bg-gold px-2 font-bold uppercase tracking-[0.05em] text-on-gold"
            style={{ fontSize: layout.stack * 0.8, lineHeight: 1.25 }}
          >
            Tapis
          </span>
        ) : (
          <span
            className="font-display tabular font-bold text-gold-amount"
            style={{ fontSize: layout.stack }}
          >
            {formatChips(seat.stack)}
            {away && (
              <span className="ml-1.5 font-sans text-[0.7em] font-medium text-text-3">Absent</span>
            )}
          </span>
        )}
      </div>

      {/* Abattage : nom de la main, gain. */}
      <AnimatePresence>
        {(handName || winnings > 0) && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.4 }}
            className="absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap"
            style={{ top: layout.plateTop + layout.plateHeight + 4 }}
          >
            {handName && (
              <span className="rounded-full bg-black/75 px-2 py-0.5 text-xs font-medium text-text">
                {handName}
              </span>
            )}
            {winnings > 0 && (
              <span className="font-display tabular rounded-full bg-gold px-2 py-0.5 text-sm font-bold text-on-gold">
                +{formatChips(winnings)}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface EmptySeatProps {
  layout: StageLayout['seat'];
  canSit: boolean;
  onSit: () => void;
}

/** Siège vide : cercle pointillé « Libre » ; cliquable pour un spectateur. */
export function EmptySeat({ layout, canSit, onSit }: EmptySeatProps) {
  const content = (
    <>
      <span
        className={`flex items-center justify-center rounded-full border-2 border-dashed font-display text-2xl ${
          canSit
            ? 'border-gold/60 text-gold group-hover:border-gold'
            : 'border-white/20 text-white/25'
        }`}
        style={{ width: layout.avatar, height: layout.avatar }}
      >
        {canSit ? '+' : ''}
      </span>
      <span
        className={`text-sm font-semibold ${canSit ? 'text-gold-light group-hover:text-gold' : 'text-text-3'}`}
      >
        {canSit ? 'S’asseoir' : 'Libre'}
      </span>
    </>
  );
  const style = { width: layout.width, height: layout.height };
  return canSit ? (
    <button
      type="button"
      onClick={onSit}
      className="group flex flex-col items-center gap-1"
      style={style}
    >
      {content}
    </button>
  ) : (
    <div className="flex flex-col items-center gap-1 opacity-80" style={style}>
      {content}
    </div>
  );
}
