interface AvatarProps {
  nickname: string;
  color: string;
  size: number;
}

/** Cercle de couleur avec l'initiale du pseudo. */
export function Avatar({ nickname, color, size }: AvatarProps) {
  const initial = Array.from(nickname.trim())[0]?.toUpperCase() ?? '?';
  return (
    <div
      className="flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white shadow-md ring-2 ring-black/40"
      style={{ width: size, height: size, background: color, fontSize: size * 0.46 }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
