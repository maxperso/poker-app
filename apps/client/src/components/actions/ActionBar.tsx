import type { PlayerAction } from '@poker/engine';
import type { RoomView } from '@poker/shared';
import { motion } from 'motion/react';
import { type ButtonHTMLAttributes, useState } from 'react';
import { formatChips } from '../../lib/format';

interface ActionBarProps {
  view: RoomView;
  busy: boolean;
  onAction: (action: PlayerAction) => void;
  width: number;
}

/**
 * Barre d'actions (DESIGN.md §2), visible seulement quand c'est au tour du héros.
 * Le client ne décide rien : il propose les bornes reçues du serveur (`view.you.legal`)
 * et envoie une intention ; le serveur revalide tout.
 */
export function ActionBar(props: ActionBarProps) {
  const { view } = props;
  const hand = view.hand;
  if (!view.you.legal || !hand || view.you.seat === null) return null;
  // Nouvelle décision (nouvelle mise à suivre, nouvelle rue) → curseur réinitialisé.
  return <ActionBarInner key={`${hand.handNumber}-${hand.street}-${hand.currentBet}`} {...props} />;
}

function ActionBarInner({ view, busy, onAction, width }: ActionBarProps) {
  const legal = view.you.legal!;
  const hand = view.hand!;
  const me = view.seats[view.you.seat!]!;
  const raise = legal.raise;
  const [amount, setAmount] = useState(raise?.min ?? 0);

  // Pot après avoir suivi : pots ramassés + mises de la rue + ce que je dois.
  const toCall = Math.max(0, hand.currentBet - me.bet);
  const potAfterCall =
    hand.pots.reduce((sum, p) => sum + p.amount, 0) +
    view.seats.reduce((sum, s) => sum + (s?.bet ?? 0), 0) +
    toCall;
  const clamp = (value: number) =>
    raise ? Math.min(raise.max, Math.max(raise.min, Math.round(value))) : 0;
  const shortcuts = raise
    ? [
        { label: 'Min', value: raise.min },
        { label: '½ pot', value: clamp(hand.currentBet + potAfterCall / 2) },
        { label: 'Pot', value: clamp(hand.currentBet + potAfterCall) },
        { label: 'Tapis', value: raise.max },
      ]
    : [];

  const isAllIn = raise !== null && amount >= raise.max;
  const raiseLabel = isAllIn ? 'Tapis' : hand.currentBet === 0 ? 'Miser' : 'Relancer';
  const raiseAction: PlayerAction = isAllIn ? { type: 'allIn' } : { type: 'raise', to: amount };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3"
      style={{ width }}
    >
      {raise && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {shortcuts.map((s) => {
              const active = amount === s.value;
              return (
                <button
                  key={s.label}
                  type="button"
                  disabled={busy}
                  onClick={() => setAmount(s.value)}
                  className={`font-display h-11 rounded-[10px] border text-xl font-semibold transition ${
                    active
                      ? 'border-gold bg-gold text-on-gold'
                      : 'border-gold-soft text-gold-light hover:border-gold'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-4">
            <span className="text-[15px] text-text-3">Mise</span>
            <input
              type="range"
              className="bet-slider flex-1"
              min={raise.min}
              max={raise.max}
              step={Math.max(1, view.blinds.small)}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label="Montant de la mise"
            />
          </label>
        </>
      )}

      <div className={`grid gap-2.5 ${raise ? 'grid-cols-[1fr_1fr_1.15fr]' : 'grid-cols-2'}`}>
        <ActionButton tone="fold" disabled={busy} onClick={() => onAction({ type: 'fold' })}>
          Se coucher
        </ActionButton>
        {legal.canCheck ? (
          <ActionButton tone="call" disabled={busy} onClick={() => onAction({ type: 'check' })}>
            Parole
          </ActionButton>
        ) : (
          <ActionButton tone="call" disabled={busy} onClick={() => onAction({ type: 'call' })}>
            Suivre {formatChips(legal.callAmount)}
          </ActionButton>
        )}
        {raise && (
          <ActionButton
            tone="raise"
            disabled={busy || amount < raise.min || amount > raise.max}
            onClick={() => onAction(raiseAction)}
          >
            {raiseLabel} {formatChips(amount)}
          </ActionButton>
        )}
      </div>
    </motion.div>
  );
}

const TONES = {
  fold: 'bg-fold text-text hover:brightness-125',
  call: 'bg-call text-white hover:brightness-110',
  raise: 'bg-gold text-on-gold hover:brightness-110',
};

function ActionButton({
  tone,
  ...props
}: { tone: keyof typeof TONES } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`font-display tabular h-14 whitespace-nowrap rounded-[10px] px-2 text-[23px] font-bold uppercase tracking-[0.03em] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${TONES[tone]}`}
    />
  );
}
