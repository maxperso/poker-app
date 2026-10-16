import type { PlayerAction } from '@poker/engine';
import type { GameEvent, RoomView } from '@poker/shared';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActionBar } from '../components/actions/ActionBar';
import { HeroCards } from '../components/table/HeroCards';
import { Table } from '../components/table/Table';
import { Button } from '../components/ui/Button';
import { useElementSize } from '../hooks/useElementSize';
import { useRoom, useServerNow } from '../hooks/useRoom';
import { errorMessage, formatChips } from '../lib/format';
import { navigate, roomUrl } from '../lib/router';
import { type ClientError, request } from '../lib/socket';
import { NicknameScreen } from './NicknameScreen';

export function RoomPage({ roomId, nickname }: { roomId: string; nickname: string }) {
  const connection = useRoom(roomId, nickname);

  if (connection.status === 'joining') {
    return <CenteredMessage title="Connexion au salon…" />;
  }
  if (connection.status === 'error') {
    if (connection.error === 'NICKNAME_TAKEN') {
      return (
        <NicknameScreen
          initial={nickname}
          notice={`« ${nickname} » est déjà pris dans ce salon.`}
        />
      );
    }
    const message =
      connection.error === 'ROOM_CLOSED'
        ? 'Ce salon a été fermé faute de joueurs.'
        : errorMessage(connection.error);
    return (
      <CenteredMessage title="Impossible de rejoindre" detail={message}>
        <Button variant="primary" onClick={() => navigate('/')}>
          Retour aux salons
        </Button>
      </CenteredMessage>
    );
  }
  return (
    <GameScreen
      view={connection.view}
      events={connection.events}
      clockOffset={connection.clockOffset}
      connected={connection.connected}
    />
  );
}

interface GameScreenProps {
  view: RoomView;
  events: GameEvent[];
  clockOffset: number;
  connected: boolean;
}

function GameScreen({ view, events, clockOffset, connected }: GameScreenProps) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(rootRef);
  const compact = width < 720 || height < 560;

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3_500);
    return () => clearTimeout(id);
  }, [toast]);

  /** Envoie une commande ; en cas de refus, affiche le message. */
  const send = useCallback(
    async (promise: Promise<{ ok: true } | { ok: false; error: ClientError }>) => {
      setBusy(true);
      const res = await promise;
      setBusy(false);
      if (!res.ok) setToast(errorMessage(res.error));
    },
    [],
  );

  const onAction = (action: PlayerAction) => {
    if (!view.hand) return;
    void send(request('game:action', { handNumber: view.hand.handNumber, action }));
  };

  const heroCardWidth = compact
    ? Math.min(78, Math.max(58, width * 0.17))
    : Math.min(118, Math.max(84, width * 0.07));

  return (
    <div ref={rootRef} className="flex h-dvh flex-col overflow-hidden">
      <TopBar view={view} clockOffset={clockOffset} connected={connected} compact={compact} />

      <main className="relative min-h-0 flex-1">
        <Table
          view={view}
          events={events}
          clockOffset={clockOffset}
          onSit={(seat) => void send(request('seat:take', { seat }))}
          center={
            <CenterMessage
              view={view}
              clockOffset={clockOffset}
              busy={busy}
              onStart={() => void send(request('game:start'))}
            />
          }
        />
      </main>

      <footer
        className={`relative z-30 border-t border-line/60 bg-ink/80 px-3 pt-2 backdrop-blur ${
          compact
            ? 'flex flex-col gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
            : 'grid grid-cols-[1fr_auto_1fr] items-end gap-4 pb-3'
        }`}
      >
        <div
          className={
            compact ? 'flex items-end justify-between gap-2' : 'flex items-end gap-2 self-end'
          }
        >
          <SeatControls view={view} busy={busy} send={send} compact={compact} />
          {compact && <HeroCards view={view} events={events} cardWidth={heroCardWidth} />}
        </div>
        {!compact && <HeroCards view={view} events={events} cardWidth={heroCardWidth} />}
        <div className={compact ? 'w-full' : 'flex justify-end'}>
          <div className={compact ? 'w-full' : 'w-[380px]'}>
            <ActionBar view={view} busy={busy} onAction={onAction} compact={compact} />
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-xl border border-[#5b2a31] bg-[#3b1d22] px-4 py-2 text-sm text-[#fca5a5] shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TopBar({
  view,
  clockOffset,
  connected,
  compact,
}: {
  view: RoomView;
  clockOffset: number;
  connected: boolean;
  compact: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(view.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.prompt('Copiez ce lien :', roomUrl(view.id));
    }
  };

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line/60 bg-panel/70 px-3 backdrop-blur">
      <Button variant="ghost" size="sm" onClick={() => navigate('/')} title="Quitter le salon">
        ← {compact ? '' : 'Salons'}
      </Button>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate font-semibold">{view.name}</div>
        <BlindsInfo view={view} clockOffset={clockOffset} />
      </div>
      {!connected && (
        <span className="rounded-full bg-danger/20 px-2 py-0.5 text-xs font-semibold text-[#fca5a5]">
          Reconnexion…
        </span>
      )}
      <Button variant="secondary" size="sm" onClick={() => void copy()}>
        {copied ? 'Lien copié ✓' : compact ? 'Inviter' : 'Copier le lien d’invitation'}
      </Button>
    </header>
  );
}

function BlindsInfo({ view, clockOffset }: { view: RoomView; clockOffset: number }) {
  const now = useServerNow(clockOffset, 1_000);
  const { small, big, level, nextLevelAt } = view.blinds;
  let next = '';
  if (nextLevelAt !== null) {
    const seconds = Math.max(0, Math.round((nextLevelAt - now) / 1000));
    next = ` · hausse dans ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return (
    <div className="tabular truncate text-xs text-muted">
      Blinds {formatChips(small)}/{formatChips(big)}
      {view.config.blinds.increaseEveryMinutes !== null && ` · niveau ${level + 1}`}
      {next}
    </div>
  );
}

function CenterMessage({
  view,
  clockOffset,
  busy,
  onStart,
}: {
  view: RoomView;
  clockOffset: number;
  busy: boolean;
  onStart: () => void;
}) {
  const now = useServerNow(clockOffset, 500);
  const seated = view.seats.filter(Boolean).length;
  const host = view.members.find((m) => m.isHost);
  const nickname = (seat: number) =>
    view.members.find((m) => m.publicId === view.seats[seat]?.publicId)?.nickname ?? '?';

  if (view.status === 'waiting') {
    return view.you.isHost ? (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/35 px-4 py-3">
        <Button variant="primary" size="lg" disabled={busy || seated < 2} onClick={onStart}>
          Lancer la partie
        </Button>
        <span className="text-xs text-white/70">
          {seated < 2 ? 'Il faut au moins 2 joueurs assis.' : `${seated} joueurs assis`}
        </span>
      </div>
    ) : (
      <Pill>En attente du lancement par {host?.nickname ?? 'l’hôte'}…</Pill>
    );
  }

  const hand = view.hand;
  if (hand?.isComplete && hand.result) {
    const totals = new Map<number, number>();
    for (const award of hand.result.awards) {
      for (const w of award.winners) totals.set(w.seat, (totals.get(w.seat) ?? 0) + w.amount);
    }
    const names = [...totals.keys()].map(nickname);
    const amount = [...totals.values()].reduce((a, b) => a + b, 0);
    const countdown =
      view.nextHandAt === null ? null : Math.max(0, Math.ceil((view.nextHandAt - now) / 1000));
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-col items-center gap-1"
      >
        <Pill gold>
          {names.length > 1
            ? `${names.join(' et ')} se partagent ${formatChips(amount)}`
            : `${names[0]} remporte ${formatChips(amount)}`}
        </Pill>
        {countdown !== null && (
          <span className="text-xs text-white/60">Prochaine main dans {countdown} s</span>
        )}
      </motion.div>
    );
  }

  if (!hand || hand.isComplete) {
    return <Pill>En attente de joueurs…</Pill>;
  }
  return null;
}

function Pill({ children, gold = false }: { children: ReactNode; gold?: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-semibold ${gold ? 'bg-gold text-ink' : 'bg-black/40 text-white/85'}`}
    >
      {children}
    </span>
  );
}

function SeatControls({
  view,
  busy,
  send,
  compact,
}: {
  view: RoomView;
  busy: boolean;
  send: (p: Promise<{ ok: true } | { ok: false; error: ClientError }>) => Promise<void>;
  compact: boolean;
}) {
  const mySeat = view.you.seat;
  if (mySeat === null) {
    const free = view.seats.some((s) => s === null);
    return (
      <p className="max-w-56 text-xs text-muted">
        {free
          ? 'Spectateur : cliquez sur une place libre pour vous asseoir.'
          : 'Spectateur : la table est complète.'}
      </p>
    );
  }
  const seat = view.seats[mySeat]!;
  return (
    <div className={`flex gap-1.5 ${compact ? 'flex-col items-start' : 'flex-wrap items-center'}`}>
      {view.you.canRebuy && (
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => void send(request('player:rebuy'))}
        >
          Se recaver ({formatChips(view.config.startingStack)})
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => void send(request('player:sitOut', { sittingOut: !seat.sittingOut }))}
      >
        {seat.sittingOut ? 'Je reviens' : 'M’absenter'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => void send(request('seat:leave'))}
      >
        Quitter la table
      </Button>
    </div>
  );
}

function CenteredMessage({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      {detail && <p className="text-muted">{detail}</p>}
      {children}
    </div>
  );
}
