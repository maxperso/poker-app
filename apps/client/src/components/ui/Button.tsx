import type { ButtonHTMLAttributes } from 'react';

const VARIANTS = {
  primary: 'bg-gold text-ink hover:brightness-110 shadow-[0_6px_20px_rgba(242,193,78,0.25)]',
  secondary: 'bg-panel-2 text-white hover:bg-line border border-line',
  ghost: 'text-white/80 hover:text-white hover:bg-white/5',
  danger: 'bg-[#3b1d22] text-[#fca5a5] hover:bg-[#4c232a] border border-[#5b2a31]',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  );
}

interface SegmentedProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

/** Choix exclusif sous forme de boutons accolés (ex. Public / Privé). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-xl bg-ink p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`min-w-10 flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            option.value === value
              ? 'bg-panel-2 text-gold shadow'
              : 'text-white/60 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
