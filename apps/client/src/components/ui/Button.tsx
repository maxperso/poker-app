import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Boutons de la charte. Le texte sur fond or est toujours foncé (#14110c) :
 * le blanc sur or n'a pas assez de contraste.
 */
const VARIANTS = {
  gold: 'bg-gold text-on-gold hover:brightness-110',
  outlineGold: 'border border-gold text-gold-light hover:bg-gold/10',
  outline: 'border border-white/20 text-text-2 hover:border-white/40 hover:text-text',
  ghost: 'text-text-2 hover:text-text hover:bg-white/5',
  disabled: 'bg-white/[0.06] text-text-3',
};

const SIZES = {
  sm: 'h-9 px-3',
  md: 'h-11 px-5',
  lg: 'h-14 px-6',
};

/** Taille du texte par défaut, selon la taille du bouton et le style (texte courant / action). */
const TEXT = {
  sm: { body: 'text-sm', display: 'text-lg' },
  md: { body: 'text-[15px]', display: 'text-xl' },
  lg: { body: 'text-lg', display: 'text-[26px]' },
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Libellé d'action : Barlow Condensed en majuscules. */
  display?: boolean;
  /** Remplace la taille de texte par défaut (ex. 'text-[22px]'). */
  textSize?: string;
}

export function Button({
  variant = 'outline',
  size = 'md',
  display = false,
  textSize,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
        display ? 'font-display font-bold uppercase tracking-[0.04em]' : ''
      } ${textSize ?? TEXT[size][display ? 'display' : 'body']} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  );
}

interface ChoiceProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  columns?: number;
  display?: boolean;
}

/** Choix exclusif en boutons séparés ; l'option active passe en fond or. */
export function Choice<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  columns,
  display = false,
}: ChoiceProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`h-11 rounded-[10px] border font-semibold transition ${
              display ? 'font-display text-xl' : 'text-[15px]'
            } ${
              active
                ? 'border-gold bg-gold text-on-gold'
                : 'border-gold-soft text-gold-light hover:border-gold'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Libellé de champ + contenu + aide éventuelle. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[15px] font-semibold text-gold-light">{label}</span>
      {children}
      {hint && <span className="text-sm text-text-3">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'h-12 w-full rounded-[10px] border border-white/10 bg-field px-4 text-[17px] text-text outline-none placeholder:text-text-3 focus:border-gold';

/** Logo : jeton + « POKER INTERCO » en or. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="chip inline-block" style={{ width: size * 1.25, height: size * 1.25 }} />
      <span
        className="font-display font-bold uppercase tracking-[0.06em] text-gold"
        style={{ fontSize: size * 1.15 }}
      >
        Poker Interco
      </span>
    </div>
  );
}
