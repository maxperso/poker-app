interface AvatarProps {
  nickname: string;
  color: string;
  size: number;
  /** Liseré or autour de l'avatar (aperçu du pseudo, joueur local). */
  ring?: boolean;
}

/** Cercle de couleur avec l'initiale du pseudo (Barlow Condensed, texte foncé). */
export function Avatar({ nickname, color, size, ring = false }: AvatarProps) {
  const initial = Array.from(nickname.trim())[0]?.toUpperCase() ?? '?';
  return (
    <div
      className="font-display flex shrink-0 select-none items-center justify-center rounded-full font-bold text-on-gold"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.5,
        lineHeight: 1,
        boxShadow: ring
          ? `0 0 0 ${Math.max(3, size * 0.04)}px #15120e, 0 0 0 ${Math.max(5, size * 0.065)}px #d4a64a`
          : undefined,
      }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
