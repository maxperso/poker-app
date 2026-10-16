import type { MemberView, SeatView } from '@poker/shared';
import { AnimatePresence, motion } from 'motion/react';
import { formatChips } from '../../lib/format';
import { Avatar } from './Avatar';
import { PlayingCard } from './PlayingCard';
import { TurnTimer } from './TurnTimer';

export interface SeatProps {
  seat: SeatView;
  member: MemberView | undefined;
  isMe: boolean;
  /** Largeur de la plaque (px) : tout le reste en découle. */
  width: number;
  /** Les cartes s'affichent au-dessus de la plaque (en haut de l'écran : en dessous). */
  cardsBelow: boolean;
  /** Vecteur du siège vers le centre de la table (pour la distribution). */
  toCenter: { x: number; y: number };
  handNumber: number | null;
  /** Retards de distribution des deux cartes (s), ou null si pas d'animation. */
  dealDelays: [number, number] | null;
  turn: { deadline: number; totalMs: number; clockOffset: number } | null;
  /** Nom de la main à l'abattage. */
  handName: string | null;
  /** Gain de la main qui vient de se terminer. */
  winnings: number;
  /** Cartes de la meilleure main (à surligner à l'abattage). */
  bestCards: string[];
}

export function Seat({
  seat,
  member,
  isMe,
  width,
  cardsBelow,
  toCenter,
  handNumber,
  dealDelays,
  turn,
  handName,
  winnings,
  bestCards,
}: SeatProps) {
  const avatarSize = Math.round(width * 0.36);
  const nickname = member?.nickname ?? '…';
  const inactive = seat.folded || seat.sittingOut;
  const cardWidth = Math.round(width * (seat.cards && seat.cards !== 'hidden' ? 0.36 : 0.27));
  const showCards = !isMe && seat.cards !== null;
  const status = seat.allIn
    ? { text: 'Tapis', className: 'bg-danger text-white' }
    : seat.sittingOut
      ? { text: 'Absent', className: 'bg-white/15 text-muted' }
      : seat.folded
        ? { text: 'Couché', className: 'bg-white/10 text-muted' }
        : null;

  return (
    <div className="relative flex flex-col items-center" style={{ width }}>
      {/* Cartes de l'adversaire : petites, face cachée, sauf à l'abattage. */}
      {showCards && handNumber !== null && (
        <div
          className="absolute left-1/2 z-0 flex -translate-x-1/2"
          style={{
            [cardsBelow ? 'top' : 'bottom']: `calc(100% - ${Math.round(width * 0.08)}px)`,
            gap: Math.round(cardWidth * -0.25),
          }}
        >
          {[0, 1].map((i) => {
            const card = seat.cards === 'hidden' || seat.cards === null ? null : seat.cards[i]!;
            return (
              <PlayingCard
                key={`${handNumber}-${i}`}
                card={card}
                width={cardWidth}
                rotate={i === 0 ? -6 : 6}
                dimmed={seat.folded}
                highlighted={card !== null && bestCards.includes(card)}
                dealFrom={dealDelays ? toCenter : undefined}
                delay={dealDelays?.[i] ?? 0}
              />
            );
          })}
        </div>
      )}

      {/* Plaque : avatar + pseudo + tapis. */}
      <motion.div
        className={`relative z-10 flex w-full items-center gap-2 rounded-full border py-1 pl-1 pr-3 shadow-lg backdrop-blur ${
          turn
            ? 'border-turn bg-panel-2/95 shadow-[0_0_18px_rgba(251,191,36,0.45)]'
            : winnings > 0
              ? 'border-gold bg-panel-2/95 shadow-[0_0_18px_rgba(242,193,78,0.5)]'
              : 'border-line bg-panel/90'
        }`}
        animate={{ opacity: inactive ? 0.55 : 1 }}
      >
        <div className="relative" style={{ width: avatarSize, height: avatarSize }}>
          <Avatar nickname={nickname} color={member?.color ?? '#475569'} size={avatarSize} />
          {turn && (
            <TurnTimer
              key={turn.deadline}
              size={avatarSize + 8}
              deadline={turn.deadline}
              totalMs={turn.totalMs}
              clockOffset={turn.clockOffset}
            />
          )}
          {member && !member.connected && (
            <span
              title="Déconnecté"
              className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-panel bg-muted"
            />
          )}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div
            className={`truncate font-semibold ${isMe ? 'text-gold' : 'text-white'}`}
            style={{ fontSize: Math.max(11, width * 0.105) }}
            title={nickname}
          >
            {nickname}
          </div>
          <div className="tabular text-white/80" style={{ fontSize: Math.max(11, width * 0.1) }}>
            {status ? (
              <span
                className={`rounded px-1 py-px text-[0.85em] font-semibold uppercase ${status.className}`}
              >
                {status.text}
              </span>
            ) : (
              formatChips(seat.stack)
            )}
          </div>
        </div>
      </motion.div>

      {/* Nom de la main à l'abattage, gain. */}
      <AnimatePresence>
        {(handName || winnings > 0) && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.4 }}
            className="absolute z-20 flex flex-col items-center gap-0.5 whitespace-nowrap"
            style={{ [cardsBelow ? 'bottom' : 'top']: 'calc(100% + 4px)' }}
          >
            {handName && (
              <span className="rounded-md bg-black/75 px-2 py-0.5 text-xs font-medium text-white">
                {handName}
              </span>
            )}
            {winnings > 0 && (
              <span className="tabular rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-ink">
                +{formatChips(winnings)}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface EmptySeatProps {
  width: number;
  canSit: boolean;
  onSit: () => void;
}

export function EmptySeat({ width, canSit, onSit }: EmptySeatProps) {
  const size = Math.round(width * 0.36);
  if (!canSit) {
    return (
      <div
        className="rounded-full border border-dashed border-white/15"
        style={{ width: size, height: size }}
        aria-label="Place libre"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onSit}
      className="group flex items-center gap-2 rounded-full border border-dashed border-white/30 bg-black/30 py-1 pl-1 pr-3 text-sm text-white/80 transition hover:border-gold hover:text-gold"
    >
      <span
        className="flex items-center justify-center rounded-full border border-dashed border-current text-lg"
        style={{ width: size, height: size }}
      >
        +
      </span>
      S’asseoir
    </button>
  );
}
