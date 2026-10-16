import type { PlayerAction } from '@poker/engine';
import type { RoomView } from '@poker/shared';
import { motion } from 'motion/react';
import { type ButtonHTMLAttributes, useState } from 'react';
import { formatChips } from '../../lib/format';

interface ActionBarProps {
  view: RoomView;
  busy: boolean;
  onAction: (action: PlayerAction) => void;
  compact: boolean;
}

/**
 * Se coucher / Check-Suivre / Miser-Relancer, avec un slider et des raccourcis.
 * Le client ne calcule rien de décisif : il propose les bornes reçues du serveur
 * (`view.you.legal`) et envoie une intention. Le serveur revalide tout.
 */
export function ActionBar({ view, busy, onAction, compact }: ActionBarProps) {
  const legal = view.you.legal;
  const hand = view.hand;
  const me = view.you.seat === null ? null : view.seats[view.you.seat];
  if (!legal || !hand || !me) return null;

  return (
    <ActionBarInner
      // Nouvelle décision (nouvelle mise à suivre, nouvelle rue) → slider réinitialisé.
      key={`${hand.handNumber}-${hand.street}-${hand.currentBet}`}
      view={view}
      busy={busy}
      onAction={onAction}
      compact={compact}
    />
  );
}

function ActionBarInner({ view, busy, onAction, compact }: ActionBarProps) {
  const legal = view.you.legal!;
  const hand = view.hand!;
  const me = view.seats[view.you.seat!]!;
  const raise = legal.raise;
  const [amount, setAmount] = useState(raise?.min ?? 0);

  // Taille du pot après avoir suivi : pots ramassés + toutes les mises de la rue + ce qu'on doit.
  const toCall = Math.max(0, hand.currentBet - me.bet);
  const potAfterCall =
    hand.pots.reduce((sum, p) => sum + p.amount, 0) +
    view.seats.reduce((sum, s) => sum + (s?.bet ?? 0), 0) +
    toCall;
  const clamp = (value: number) =>
    raise ? Math.min(raise.max, Math.max(raise.min, Math.round(value))) : 0;
  const shortcuts = raise
    ? [
        { label: '½ pot', value: clamp(hand.currentBet + potAfterCall / 2) },
        { label: 'Pot', value: clamp(hand.currentBet + potAfterCall) },
        { label: 'Tapis', value: raise.max },
      ]
    : [];

  const isBet = hand.currentBet === 0;
  const isAllIn = raise !== null && amount >= raise.max;
  const callIsAllIn = legal.callAmount > 0 && legal.callAmount >= me.stack;

  const raiseAction: PlayerAction = isAllIn ? { type: 'allIn' } : { type: 'raise', to: amount };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full flex-col gap-2 rounded-2xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur"
    >
      {raise && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            {shortcuts.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={busy}
                onClick={() => setAmount(s.value)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  amount === s.value ? 'bg-gold text-ink' : 'bg-panel-2 text-white/85 hover:bg-line'
                }`}
              >
                {s.label}
              </button>
            ))}
            <input
              type="number"
              inputMode="numeric"
              min={raise.min}
              max={raise.max}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              onBlur={() => setAmount(clamp(amount))}
              className="tabular ml-auto w-24 rounded-lg border border-line bg-ink px-2 py-1 text-right text-sm font-semibold text-white outline-none focus:border-gold"
              aria-label="Montant de la relance"
            />
          </div>
          <input
            type="range"
            className="raise-slider w-full"
            min={raise.min}
            max={raise.max}
            step={Math.max(1, view.blinds.small)}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            aria-label="Montant de la relance"
          />
        </div>
      )}

      <div className={`grid gap-2 ${raise ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <ActionButton
          tone="fold"
          disabled={busy}
          onClick={() => onAction({ type: 'fold' })}
          compact={compact}
        >
          Se coucher
        </ActionButton>
        {legal.canCheck ? (
          <ActionButton
            tone="call"
            disabled={busy}
            onClick={() => onAction({ type: 'check' })}
            compact={compact}
          >
            Check
          </ActionButton>
        ) : (
          <ActionButton
            tone="call"
            disabled={busy}
            onClick={() => onAction({ type: 'call' })}
            compact={compact}
          >
            {callIsAllIn ? 'Suivre (tapis)' : 'Suivre'}
            <Amount value={legal.callAmount} />
          </ActionButton>
        )}
        {raise && (
          <ActionButton
            tone="raise"
            disabled={busy || amount < raise.min || amount > raise.max}
            onClick={() => onAction(raiseAction)}
            compact={compact}
          >
            {isAllIn ? 'Tapis' : isBet ? 'Miser' : 'Relancer à'}
            <Amount value={amount} />
          </ActionButton>
        )}
      </div>
    </motion.div>
  );
}

function Amount({ value }: { value: number }) {
  return (
    <span className="tabular block text-[0.8em] font-bold opacity-90">{formatChips(value)}</span>
  );
}

const TONES = {
  fold: 'bg-[#3b1d22] text-[#fca5a5] hover:bg-[#4c232a] border-[#5b2a31]',
  call: 'bg-[#16321f] text-[#86efac] hover:bg-[#1c3f27] border-[#245133]',
  raise: 'bg-gold text-ink hover:brightness-110 border-[#c99a2e]',
};

function ActionButton({
  tone,
  children,
  compact,
  ...props
}: { tone: keyof typeof TONES; compact: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`flex flex-col items-center justify-center rounded-xl border font-semibold leading-tight transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
        compact ? 'min-h-12 px-2 text-sm' : 'min-h-14 px-3 text-[15px]'
      } ${TONES[tone]}`}
    >
      {children}
    </button>
  );
}
