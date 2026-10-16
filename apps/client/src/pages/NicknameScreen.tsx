import { nicknameSchema } from '@poker/shared';
import { type FormEvent, useState } from 'react';
import { Avatar } from '../components/table/Avatar';
import { Button } from '../components/ui/Button';
import { setNickname } from '../lib/identity';
import { avatarColor } from '@poker/shared';

interface NicknameScreenProps {
  initial?: string;
  /** Message affiché au-dessus du champ (ex. pseudo déjà pris). */
  notice?: string;
  onDone?: () => void;
}

/** Premier accès (ou pseudo pris) : choisir un pseudo, mémorisé dans le navigateur. */
export function NicknameScreen({ initial = '', notice, onDone }: NicknameScreenProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const preview = value.trim() || '?';

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
        className="flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-line bg-panel p-8 shadow-2xl"
      >
        <Avatar nickname={preview} color={avatarColor(preview)} size={72} />
        <div className="text-center">
          <h1 className="text-2xl font-bold">Choisissez un pseudo</h1>
          <p className="mt-1 text-sm text-muted">
            Pas de compte : votre navigateur s’en souviendra.
          </p>
        </div>
        {notice && (
          <p className="w-full rounded-xl bg-[#3b1d22] px-3 py-2 text-center text-sm text-[#fca5a5]">
            {notice}
          </p>
        )}
        <div className="w-full">
          <input
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            maxLength={16}
            placeholder="Votre pseudo"
            className="h-12 w-full rounded-xl border border-line bg-ink px-4 text-lg text-white outline-none focus:border-gold"
            aria-label="Pseudo"
          />
          {error && <p className="mt-1.5 text-sm text-[#fca5a5]">{error}</p>}
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full">
          C’est parti
        </Button>
      </form>
    </div>
  );
}
