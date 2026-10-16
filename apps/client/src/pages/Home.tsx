import { avatarColor } from '@poker/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Avatar } from '../components/table/Avatar';
import { Button } from '../components/ui/Button';
import { useLobby } from '../hooks/useLobby';
import { navigate, roomPath } from '../lib/router';
import { CreateRoomDialog } from './CreateRoomDialog';
import { NicknameScreen } from './NicknameScreen';

export function Home({ nickname }: { nickname: string }) {
  const rooms = useLobby();
  const [creating, setCreating] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);

  if (editingNickname) {
    return <NicknameScreen initial={nickname} onDone={() => setEditingNickname(false)} />;
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:py-14">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            <span className="text-gold">♠</span> Poker entre amis
          </h1>
          <p className="mt-1 text-sm text-muted">Texas Hold’em No-Limit · jetons fictifs</p>
        </div>
        <button
          type="button"
          onClick={() => setEditingNickname(true)}
          className="flex items-center gap-2 rounded-full border border-line bg-panel py-1 pl-1 pr-3 text-sm hover:border-gold"
          title="Changer de pseudo"
        >
          <Avatar nickname={nickname} color={avatarColor(nickname)} size={28} />
          <span className="max-w-28 truncate font-semibold">{nickname}</span>
        </button>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Salons publics</h2>
          <Button variant="primary" onClick={() => setCreating(true)}>
            + Créer un salon
          </Button>
        </div>

        {rooms === null ? (
          <div className="rounded-2xl border border-line bg-panel p-8 text-center text-muted">
            Chargement…
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-panel/60 p-10 text-center">
            <div className="text-4xl">🃏</div>
            <p className="font-semibold">Aucun salon public pour l’instant</p>
            <p className="text-sm text-muted">Créez-en un et partagez le lien à vos amis.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {rooms.map((room) => {
                const full = room.players >= room.maxSeats;
                return (
                  <motion.li
                    key={room.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-4 rounded-2xl border border-line bg-panel px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{room.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-sm text-muted">
                        <SeatDots players={room.players} max={room.maxSeats} />
                        <span className="tabular">
                          {room.players}/{room.maxSeats}
                        </span>
                        <StatusBadge status={room.status} />
                      </div>
                    </div>
                    <Button
                      variant={full ? 'secondary' : 'primary'}
                      onClick={() => navigate(roomPath(room.id))}
                    >
                      {full ? 'Regarder' : 'Rejoindre'}
                    </Button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <AnimatePresence>
        {creating && <CreateRoomDialog nickname={nickname} onClose={() => setCreating(false)} />}
      </AnimatePresence>
    </div>
  );
}

function SeatDots({ players, max }: { players: number; max: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${i < players ? 'bg-success' : 'bg-line'}`}
        />
      ))}
    </span>
  );
}

function StatusBadge({ status }: { status: 'waiting' | 'playing' }) {
  return status === 'playing' ? (
    <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
      En cours
    </span>
  ) : (
    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70">
      En attente
    </span>
  );
}
