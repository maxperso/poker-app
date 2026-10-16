import { formatChips } from '../../lib/format';

/** Un jeton seul (disque rouge, bordure pointillée claire). */
export function Chip({ size = 20 }: { size?: number }) {
  return <span className="chip inline-block shrink-0" style={{ width: size, height: size }} />;
}

interface BetProps {
  amount: number;
  /** Taille du texte (px de la scène). */
  size?: number;
}

/** Mise d'un joueur : jeton + montant dans une pastille sombre. */
export function Bet({ amount, size = 18 }: BetProps) {
  return (
    <span
      className="font-display tabular inline-flex items-center gap-1.5 rounded-full bg-black/55 py-1 pl-1 pr-3 font-bold text-text"
      style={{ fontSize: size }}
    >
      <Chip size={Math.round(size * 1.15)} />
      {formatChips(amount)}
    </span>
  );
}
