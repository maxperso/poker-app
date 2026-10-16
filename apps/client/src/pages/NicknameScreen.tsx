import { avatarColor, nicknameSchema } from '@poker/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { Avatar } from '../components/table/Avatar';
import { Button, inputClass, Logo } from '../components/ui/Button';
import { setNickname } from '../lib/identity';
import { request } from '../lib/socket';

interface NicknameScreenProps {
  initial?: string;
  /** Arrivée par un lien : on affiche le nom du salon (« Tu es invité dans… »). */
  roomId?: string | null;
  /** Message d'alerte (ex. pseudo déjà pris). */
  notice?: string;
  onDone?: () => void;
}

/** Premier accès (DESIGN.md §4) : choisir un pseudo, gardé sur cet appareil. */
export function NicknameScreen({
  initial = '',
  roomId = null,
  notice,
  onDone,
}: NicknameScreenProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const preview = value.trim() || '?';

  useEffect(() => {
    if (!roomId) return;
    void request('room:peek', { roomId }).then((res) => {
      if (res.ok) setRoomName(res.name);
    });
  }, [roomId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = nicknameSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Pseudo invalide');
      return;
    }
    setNickname(parsed.data);
    onDone?.();
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-[440px] flex-col items-center gap-6 rounded-2xl border-[1.5px] border-gold/70 bg-surface p-9 shadow-[0_0_60px_rgba(212,166,74,0.12)]"
      >
        <Logo size={22} />

        {notice ? (
          <p className="w-full rounded-[10px] bg-danger/15 px-4 py-3 text-center text-[15px] text-danger">
            {notice}
          </p>
        ) : (
          roomName && (
            <p className="w-full rounded-[10px] bg-live-bg/70 px-4 py-3 text-center text-[17px] text-live-text">
              Tu es invité dans le salon « {roomName} »
            </p>
          )
        )}

        <Avatar nickname={preview} color={avatarColor(preview)} size={96} ring />

        <h1 className="font-display text-center text-[40px] font-bold leading-none">
          Comment on t’appelle ?
        </h1>

        <div className="flex w-full flex-col gap-2">
          <label htmlFor="nickname" className="text-[15px] font-semibold text-gold-light">
            Pseudo
          </label>
          <input
            id="nickname"
            autoFocus
            value={value}
            maxLength={16}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            className={inputClass}
            aria-label="Pseudo"
          />
          <span className={`text-sm ${error ? 'text-danger' : 'text-text-3'}`}>
            {error ?? '16 caractères maximum. Ton avatar est créé à partir de ton pseudo.'}
          </span>
        </div>

        <Button type="submit" variant="gold" display size="lg" className="w-full">
          {roomId ? 'Rejoindre la table' : 'Entrer'}
        </Button>

        <p className="text-center text-sm text-text-3">
          Ton pseudo est gardé sur cet appareil, pas besoin de compte.
        </p>
      </form>
    </div>
  );
}
