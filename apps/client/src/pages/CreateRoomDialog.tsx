import { createRoomSchema, type CreateRoomInput } from '@poker/shared';
import { motion } from 'motion/react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Button, Segmented } from '../components/ui/Button';
import { errorMessage } from '../lib/format';
import { navigate, roomPath } from '../lib/router';
import { request } from '../lib/socket';

interface CreateRoomDialogProps {
  nickname: string;
  onClose: () => void;
}

export function CreateRoomDialog({ nickname, onClose }: CreateRoomDialogProps) {
  const [name, setName] = useState(`Table de ${nickname}`);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [maxSeats, setMaxSeats] = useState(6);
  const [startingStack, setStartingStack] = useState(1000);
  const [small, setSmall] = useState(10);
  const [big, setBig] = useState(20);
  const [increasing, setIncreasing] = useState(false);
  const [everyMinutes, setEveryMinutes] = useState(10);
  const [onBust, setOnBust] = useState<'rebuy' | 'spectate'>('rebuy');
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input: CreateRoomInput = {
      name,
      visibility,
      maxSeats,
      startingStack,
      blinds: { small, big, increaseEveryMinutes: increasing ? everyMinutes : null },
      onBust,
      turnSeconds,
    };
    // Même schéma que le serveur : les erreurs s'affichent avant même d'envoyer.
    const parsed = createRoomSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Paramètres invalides');
      return;
    }
    setBusy(true);
    const res = await request('room:create', input);
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res.error));
    navigate(roomPath(res.roomId));
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-t-3xl border border-line bg-panel p-6 shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Créer un salon</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-muted hover:text-white"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <Field label="Nom du salon">
          <TextInput value={name} onChange={setName} maxLength={30} />
        </Field>

        <Field
          label="Visibilité"
          hint={
            visibility === 'public'
              ? 'Visible dans la liste des salons.'
              : 'Absent de la liste : seules les personnes qui ont le lien peuvent entrer.'
          }
        >
          <Segmented
            ariaLabel="Visibilité"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'public', label: 'Public' },
              { value: 'private', label: 'Privé' },
            ]}
          />
        </Field>

        <Field label="Nombre de places">
          <Segmented
            ariaLabel="Nombre de places"
            value={maxSeats}
            onChange={setMaxSeats}
            options={[2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ value: n, label: String(n) }))}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Tapis de départ">
            <NumberInput value={startingStack} onChange={setStartingStack} />
          </Field>
          <Field label="Petite blind">
            <NumberInput value={small} onChange={setSmall} />
          </Field>
          <Field label="Grosse blind">
            <NumberInput value={big} onChange={setBig} />
          </Field>
        </div>

        <Field label="Blinds">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-48 flex-1">
              <Segmented
                ariaLabel="Évolution des blinds"
                value={increasing ? 'up' : 'fixed'}
                onChange={(v) => setIncreasing(v === 'up')}
                options={[
                  { value: 'fixed', label: 'Fixes' },
                  { value: 'up', label: 'Croissantes' },
                ]}
              />
            </div>
            {increasing && (
              <label className="flex items-center gap-2 text-sm text-white/80">
                toutes les
                <span className="w-16">
                  <NumberInput value={everyMinutes} onChange={setEveryMinutes} />
                </span>
                min
              </label>
            )}
          </div>
        </Field>

        <Field label="Joueur éliminé">
          <Segmented
            ariaLabel="Joueur éliminé"
            value={onBust}
            onChange={setOnBust}
            options={[
              { value: 'rebuy', label: 'Peut se recaver' },
              { value: 'spectate', label: 'Devient spectateur' },
            ]}
          />
        </Field>

        <Field label="Temps pour jouer">
          <Segmented
            ariaLabel="Temps pour jouer"
            value={turnSeconds}
            onChange={setTurnSeconds}
            options={[15, 30, 45, 60].map((s) => ({ value: s, label: `${s} s` }))}
          />
        </Field>

        {error && (
          <p className="rounded-xl bg-[#3b1d22] px-3 py-2 text-sm text-[#fca5a5]">{error}</p>
        )}

        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? 'Création…' : 'Créer et rejoindre'}
        </Button>
      </motion.form>
    </motion.div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
}) {
  return (
    <input
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 rounded-xl border border-line bg-ink px-3 text-white outline-none focus:border-gold"
    />
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={Number.isNaN(value) ? '' : value}
      onChange={(e) => onChange(e.target.valueAsNumber)}
      className="tabular h-11 w-full rounded-xl border border-line bg-ink px-3 text-white outline-none focus:border-gold"
    />
  );
}
