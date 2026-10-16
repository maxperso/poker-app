import {
  avatarColor,
  createRoomSchema,
  type CreateRoomInput,
  type RoomSummary,
} from '@poker/shared';
import { AnimatePresence, motion } from 'motion/react';
import { type FormEvent, useState } from 'react';
import { Leaderboard } from '../components/Leaderboard';
import { Avatar } from '../components/table/Avatar';
import { Button, Choice, Field, inputClass, Logo } from '../components/ui/Button';
import { useLobby } from '../hooks/useLobby';
import { errorMessage, formatChips } from '../lib/format';
import { matchRoom, navigate, roomPath } from '../lib/router';
import { request } from '../lib/socket';
import { NicknameScreen } from './NicknameScreen';

/** Accueil (DESIGN.md §3) : rejoindre par lien, salons publics, créer un salon. */
export function Home({ nickname }: { nickname: string }) {
  const lobby = useLobby();
  const rooms = lobby?.rooms ?? null;
  const [editingNickname, setEditingNickname] = useState(false);

  if (editingNickname) {
    return <NicknameScreen initial={nickname} onDone={() => setEditingNickname(false)} />;
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1120px] flex-col gap-10 px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex items-center justify-between gap-4">
        <span className="sm:hidden">
          <Logo size={18} />
        </span>
        <span className="hidden sm:block">
          <Logo size={24} />
        </span>
        <div className="flex items-center gap-3 rounded-full border border-gold-soft bg-surface py-1.5 pl-1.5 pr-1.5">
          <Avatar nickname={nickname} color={avatarColor(nickname)} size={36} />
          <span className="hidden max-w-32 truncate text-[17px] font-semibold sm:inline">
            {nickname}
          </span>
          <button
            type="button"
            onClick={() => setEditingNickname(true)}
            className="rounded-full bg-white/[0.07] px-4 py-1.5 text-[15px] text-gold-light hover:bg-white/10"
          >
            Changer
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h1 className="font-display text-[48px] font-bold leading-none">Choisis ta table</h1>
        <p className="font-display text-2xl font-semibold text-gold-amount">
          L’interco, c’est dur. Le poker, un peu moins.
        </p>
        <p className="text-lg text-text-2">
          Rejoins un salon public, ou crée le tien et envoie le lien à tes potes.
        </p>
      </section>

      <div className="grid items-start gap-8 min-[920px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <JoinByLink />

          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[28px] font-bold">Salons publics</h2>
            {rooms && (
              <span className="text-[15px] text-text-3">
                {rooms.length} salon{rooms.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {rooms === null ? (
            <div className="rounded-2xl border border-gold-soft bg-surface p-8 text-center text-text-3">
              Chargement…
            </div>
          ) : rooms.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gold-soft bg-surface/60 p-10 text-center">
              <MiniTable />
              <p className="mt-2 text-lg font-semibold">Aucun salon public pour l’instant</p>
              <p className="text-text-2">Crée le premier, à droite.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {rooms.map((room) => (
                  <RoomRow key={room.id} room={room} />
                ))}
              </AnimatePresence>
            </ul>
          )}

          <p className="text-[15px] text-text-3">
            Les salons privés n’apparaissent pas ici : on y entre uniquement par leur lien.
          </p>
        </div>

        <CreateRoomPanel nickname={nickname} />
      </div>

      {lobby && <Leaderboard entries={lobby.leaderboard} you={lobby.you} />}
    </div>
  );
}

function JoinByLink() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    let roomId: string | null = /^[A-Za-z0-9_-]{10}$/.test(text) ? text : null;
    try {
      roomId ??= matchRoom(new URL(text).pathname);
    } catch {
      // Pas une URL : on garde l'éventuel identifiant brut.
    }
    if (!roomId) return setError('Ce n’est pas un lien de salon valide.');
    navigate(roomPath(roomId));
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-2xl border border-gold-soft bg-surface p-6"
    >
      <label htmlFor="room-link" className="text-[17px] font-semibold text-gold-light">
        Tu as reçu un lien ?
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="room-link"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Colle le lien du salon ici"
          className={inputClass}
        />
        <Button
          type="submit"
          variant="outlineGold"
          display
          size="md"
          textSize="text-[22px]"
          className="h-12 shrink-0 px-7"
        >
          Rejoindre
        </Button>
      </div>
      {error && <span className="text-sm text-danger">{error}</span>}
    </form>
  );
}

function RoomRow({ room }: { room: RoomSummary }) {
  const full = room.players >= room.maxSeats;
  const status = full
    ? { label: 'Complet', className: 'bg-white/[0.07] text-text-3' }
    : room.status === 'playing'
      ? { label: 'En cours', className: 'bg-live-bg text-live-text' }
      : { label: 'En attente', className: 'bg-wait-bg text-gold-light' };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-2xl border border-gold-soft bg-surface px-5 py-4 sm:flex-nowrap"
    >
      <MiniTable />
      <div className="min-w-0 flex-1 basis-[calc(100%-5rem)] sm:basis-0">
        <div className="truncate text-xl font-semibold">{room.name}</div>
        <div className="tabular truncate text-[16px] text-text-2">
          Blinds {formatChips(room.blinds.small)} / {formatChips(room.blinds.big)} · Stack{' '}
          {formatChips(room.startingStack)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex -space-x-2">
          {room.preview.map((player, i) => (
            <span key={i} className="rounded-full ring-2 ring-surface">
              <Avatar nickname={player.nickname} color={player.color} size={30} />
            </span>
          ))}
        </div>
        <span className="font-display tabular text-[26px] font-bold text-gold-amount">
          {room.players} / {room.maxSeats}
        </span>
      </div>
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-[15px] font-medium ${status.className}`}
      >
        {status.label}
      </span>
      <Button
        variant={full ? 'disabled' : 'gold'}
        display
        disabled={full}
        textSize="text-[22px]"
        className="h-12 w-28 shrink-0"
        onClick={() => navigate(roomPath(room.id))}
      >
        {full ? 'Complet' : 'Rejoindre'}
      </Button>
    </motion.li>
  );
}

/** Petite table de la liste des salons. */
function MiniTable() {
  return (
    <span
      className="inline-block h-8 w-14 shrink-0 rounded-full border-4 border-wood"
      style={{
        background: 'radial-gradient(ellipse, var(--color-felt-1), var(--color-felt-2))',
        boxShadow: '0 0 0 1.5px var(--color-wood-edge)',
      }}
      aria-hidden
    />
  );
}

const BLIND_OPTIONS = [
  { small: 5, big: 10 },
  { small: 10, big: 20 },
  { small: 25, big: 50 },
  { small: 50, big: 100 },
  { small: 100, big: 200 },
];
const STACK_OPTIONS = [500, 1000, 2000, 5000, 10000];

function CreateRoomPanel({ nickname }: { nickname: string }) {
  // « Le salon d’Alice », « Le salon de Bob ».
  const [name, setName] = useState(
    `Le salon ${/^[aeiouyàâäéèêëîïôöûüh]/i.test(nickname) ? 'd’' : 'de '}${nickname}`,
  );
  const [maxSeats, setMaxSeats] = useState(6);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [blindsIndex, setBlindsIndex] = useState(1);
  const [startingStack, setStartingStack] = useState(1000);
  const [moreOptions, setMoreOptions] = useState(false);
  const [increaseEvery, setIncreaseEvery] = useState<number | null>(null);
  const [onBust, setOnBust] = useState<'rebuy' | 'spectate'>('rebuy');
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const blinds = BLIND_OPTIONS[blindsIndex]!;
    const input: CreateRoomInput = {
      name,
      visibility,
      maxSeats,
      startingStack,
      blinds: { ...blinds, increaseEveryMinutes: increaseEvery },
      onBust,
      turnSeconds,
    };
    // Même schéma que le serveur : les erreurs s'affichent avant même d'envoyer.
    const parsed = createRoomSchema.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Paramètres invalides');
    setBusy(true);
    const res = await request('room:create', input);
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res.error));
    navigate(roomPath(res.roomId));
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-6 rounded-2xl border-[1.5px] border-gold/80 bg-surface p-7"
    >
      <h2 className="font-display text-[32px] font-bold leading-none text-gold">Créer un salon</h2>

      <Field label="Nom du salon">
        <input
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-gold-light">Nombre de places</span>
        <Choice
          ariaLabel="Nombre de places"
          value={maxSeats}
          onChange={setMaxSeats}
          columns={4}
          display
          options={[2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ value: n, label: String(n) }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-gold-light">Visibilité</span>
        <Choice
          ariaLabel="Visibilité"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Privé' },
          ]}
        />
        <span className="text-[15px] text-text-3">
          {visibility === 'public'
            ? 'Affiché dans la liste de l’accueil, et accessible par lien.'
            : 'Absent de la liste : seules les personnes qui ont le lien peuvent entrer.'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Blinds">
          <select
            value={blindsIndex}
            onChange={(e) => setBlindsIndex(Number(e.target.value))}
            className={`${inputClass} field-select`}
          >
            {BLIND_OPTIONS.map((b, i) => (
              <option key={i} value={i}>
                {formatChips(b.small)} / {formatChips(b.big)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stack de départ">
          <select
            value={startingStack}
            onChange={(e) => setStartingStack(Number(e.target.value))}
            className={`${inputClass} field-select`}
          >
            {STACK_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {formatChips(s)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button
        type="button"
        onClick={() => setMoreOptions((v) => !v)}
        className="-mt-2 self-start text-[15px] text-gold-light hover:text-gold"
        aria-expanded={moreOptions}
      >
        {moreOptions ? '▾' : '▸'} Plus d’options
      </button>
      {moreOptions && (
        <div className="-mt-2 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-gold-light">Blinds</span>
            <Choice
              ariaLabel="Évolution des blinds"
              value={increaseEvery ?? 0}
              onChange={(v) => setIncreaseEvery(v === 0 ? null : v)}
              columns={4}
              options={[
                { value: 0, label: 'Fixes' },
                { value: 10, label: '10 min' },
                { value: 15, label: '15 min' },
                { value: 20, label: '20 min' },
              ]}
            />
            <span className="text-[15px] text-text-3">
              {increaseEvery === null
                ? 'Les blinds ne bougent pas de la partie.'
                : `Les blinds augmentent toutes les ${increaseEvery} minutes.`}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-gold-light">Joueur éliminé</span>
            <Choice
              ariaLabel="Joueur éliminé"
              value={onBust}
              onChange={setOnBust}
              options={[
                { value: 'rebuy', label: 'Peut se recaver' },
                { value: 'spectate', label: 'Spectateur' },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-gold-light">Temps pour jouer</span>
            <Choice
              ariaLabel="Temps pour jouer"
              value={turnSeconds}
              onChange={setTurnSeconds}
              options={[15, 30, 45, 60].map((s) => ({ value: s, label: `${s} s` }))}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-[10px] bg-danger/15 px-3 py-2 text-[15px] text-danger">{error}</p>
      )}

      <Button type="submit" variant="gold" display size="lg" disabled={busy}>
        {busy ? 'Création…' : 'Créer le salon'}
      </Button>
    </form>
  );
}
