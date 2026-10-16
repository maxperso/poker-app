import { formatChips } from '../../lib/format';

/** Couleurs des jetons par valeur, de la plus grosse à la plus petite. */
const DENOMINATIONS = [
  { value: 1000, color: '#e7b416', edge: '#8a6a00' },
  { value: 500, color: '#7c3aed', edge: '#43207f' },
  { value: 100, color: '#1f2937', edge: '#0b0f14' },
  { value: 25, color: '#16a34a', edge: '#0b5326' },
  { value: 5, color: '#dc2626', edge: '#7a1212' },
  { value: 1, color: '#e5e7eb', edge: '#7b818c' },
];

/** Décompose un montant en quelques jetons visibles (5 au maximum), juste pour l'aspect. */
function chipColors(amount: number): (typeof DENOMINATIONS)[number][] {
  const chips: (typeof DENOMINATIONS)[number][] = [];
  let rest = amount;
  for (const denomination of DENOMINATIONS) {
    while (rest >= denomination.value && chips.length < 5) {
      chips.push(denomination);
      rest -= denomination.value;
    }
  }
  return chips.length > 0 ? chips.reverse() : [DENOMINATIONS.at(-1)!];
}

interface ChipsProps {
  amount: number;
  size?: number;
  /** Afficher le montant à côté de la pile. */
  label?: boolean;
}

export function Chips({ amount, size = 18, label = true }: ChipsProps) {
  const stack = chipColors(amount);
  const step = Math.max(2, Math.round(size * 0.16));
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size + step * (stack.length - 1) }}>
        {stack.map((chip, i) => (
          <div
            key={i}
            className="absolute left-0 rounded-full"
            style={{
              width: size,
              height: size,
              bottom: i * step,
              background: `repeating-conic-gradient(${chip.color} 0 30deg, #f8fafc 30deg 45deg)`,
              boxShadow: `0 0 0 ${Math.max(1, size * 0.08)}px ${chip.edge}, 0 1px 2px rgba(0,0,0,0.5)`,
            }}
          >
            <div
              className="absolute rounded-full"
              style={{
                inset: size * 0.2,
                background: chip.color,
                border: `1px solid ${chip.edge}`,
              }}
            />
          </div>
        ))}
      </div>
      {label && (
        <span
          className="tabular rounded-full bg-black/55 px-2 py-0.5 font-semibold text-white"
          style={{ fontSize: Math.max(11, size * 0.7) }}
        >
          {formatChips(amount)}
        </span>
      )}
    </div>
  );
}
