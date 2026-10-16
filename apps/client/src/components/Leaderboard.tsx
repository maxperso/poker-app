import type { LeaderboardEntry } from '@poker/shared';
import { motion } from 'motion/react';
import { formatChips } from '../lib/format';
import { Avatar } from './table/Avatar';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  /** Mon identifiant public, pour me repérer. */
  you: string;
}

/** « +1 240 » / « −340 » : le signe compte autant que le montant. */
function signed(amount: number): string {
  if (amount > 0) return `+${formatChips(amount)}`;
  if (amount < 0) return `−${formatChips(-amount)}`;
  return '0';
}

function winRate(entry: LeaderboardEntry): string {
  return entry.handsPlayed === 0
    ? '—'
    : `${Math.round((entry.handsWon / entry.handsPlayed) * 100)} %`;
}

const amountClass = (amount: number) =>
  amount > 0 ? 'text-live-text' : amount < 0 ? 'text-danger' : 'text-text-2';

/**
 * Classement de l'accueil (proposition, hors maquettes) : podium pour les trois premiers,
 * puis un tableau. Classé par gains nets cumulés, toutes tables confondues.
 */
export function Leaderboard({ entries, you }: LeaderboardProps) {
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-[28px] font-bold">Le classement</h2>
          <p className="text-[15px] text-text-3">Gains nets cumulés, toutes tables confondues.</p>
        </div>
        {entries.length > 0 && (
          <span className="text-[15px] text-text-3">
            {entries.length} joueur{entries.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gold-soft bg-surface/60 p-8 text-center">
          <p className="text-lg font-semibold">Personne n’a encore joué de main.</p>
          <p className="text-text-2">Le premier pot est pour toi ?</p>
        </div>
      ) : (
        <>
          <ol className="grid gap-3 sm:grid-cols-3">
            {podium.map((entry, i) => (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative flex flex-col items-center gap-2 rounded-2xl border bg-surface px-4 pb-5 pt-6 text-center ${
                  i === 0
                    ? 'border-gold shadow-[0_0_30px_rgba(212,166,74,0.18)]'
                    : 'border-gold-soft'
                }`}
              >
                <span
                  className={`font-display absolute left-4 top-3 text-2xl font-bold ${
                    i === 0 ? 'text-gold' : 'text-text-3'
                  }`}
                >
                  {i + 1}
                </span>
                <Avatar
                  nickname={entry.nickname}
                  color={entry.color}
                  size={i === 0 ? 64 : 52}
                  ring={i === 0}
                />
                <span className="flex max-w-full items-center gap-2">
                  <span className="truncate text-lg font-semibold">{entry.nickname}</span>
                  {entry.id === you && <YouPill />}
                </span>
                <span
                  className={`font-display tabular text-[32px] font-bold leading-none ${amountClass(entry.net)}`}
                >
                  {signed(entry.net)}
                </span>
                <span className="tabular text-sm text-text-3">
                  {entry.handsWon} main{entry.handsWon > 1 ? 's' : ''} gagnée
                  {entry.handsWon > 1 ? 's' : ''} · {winRate(entry)}
                </span>
              </motion.li>
            ))}
          </ol>

          {rest.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-gold-soft bg-surface">
              <table className="tabular w-full text-left text-[15px]">
                <thead className="text-[13px] uppercase tracking-[0.12em] text-text-3">
                  <tr className="border-b border-gold-soft">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-2 py-3 font-medium">Joueur</th>
                    <th className="hidden px-2 py-3 text-right font-medium sm:table-cell">Mains</th>
                    <th className="hidden px-2 py-3 text-right font-medium sm:table-cell">
                      Gagnées
                    </th>
                    <th className="hidden px-2 py-3 text-right font-medium md:table-cell">
                      Plus gros pot
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Gains</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((entry, i) => (
                    <tr
                      key={entry.id}
                      className={`border-b border-white/5 last:border-0 ${entry.id === you ? 'bg-wait-bg' : ''}`}
                    >
                      <td className="font-display px-4 py-2.5 text-lg font-bold text-text-3">
                        {i + 4}
                      </td>
                      <td className="max-w-0 px-2 py-2.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar nickname={entry.nickname} color={entry.color} size={30} />
                          <span className="truncate font-semibold">{entry.nickname}</span>
                          {entry.id === you && <YouPill />}
                        </span>
                      </td>
                      <td className="hidden px-2 py-2.5 text-right text-text-2 sm:table-cell">
                        {formatChips(entry.handsPlayed)}
                      </td>
                      <td className="hidden px-2 py-2.5 text-right text-text-2 sm:table-cell">
                        {formatChips(entry.handsWon)}
                        <span className="ml-1.5 text-text-3">({winRate(entry)})</span>
                      </td>
                      <td className="hidden px-2 py-2.5 text-right text-text-2 md:table-cell">
                        {formatChips(entry.biggestPot)}
                      </td>
                      <td
                        className={`font-display px-4 py-2.5 text-right text-xl font-bold ${amountClass(entry.net)}`}
                      >
                        {signed(entry.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function YouPill() {
  return (
    <span className="shrink-0 rounded-full bg-gold px-2 py-px text-xs font-bold uppercase text-on-gold">
      Toi
    </span>
  );
}
