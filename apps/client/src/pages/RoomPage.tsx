import type { PlayerAction } from '@poker/engine';
import type { GameEvent, RoomView } from '@poker/shared';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActionBar } from '../components/actions/ActionBar';
import { Stage } from '../components/Stage';
import { Hero } from '../components/table/Hero';
import { handOutcome, Table } from '../components/table/Table';
import { Button } from '../components/ui/Button';
import { useElementSize } from '../hooks/useElementSize';
import { useRoom, useServerNow } from '../hooks/useRoom';
import { errorMessage, formatChips } from '../lib/format';
import { navigate, roomUrl } from '../lib/router';
import { type ClientError, request } from '../lib/socket';
import { DESKTOP, MOBILE, type StageLayout } from '../lib/tableLayout';
import { NicknameScreen } from './NicknameScreen';

type Send = (promise: Promise<{ ok: true } | { ok: false; error: ClientError }>) => Promise<void>;

export function RoomPage({ roomId, nickname }: { roomId: string; nickname: string }) {
  const connection = useRoom(roomId, nickname);

  if (connection.status === 'joining') return <CenteredMessage title="Connexion au salon…" />;
  if (connection.status === 'error') {
    if (connection.error === 'NICKNAME_TAKEN') {
      return (
        <NicknameScreen
          initial={nickname}
          roomId={roomId}
          notice={`« ${nickname} » est déjà pris dans ce salon, choisis-en un autre.`}
        />
      );
    }
    const message =
      connection.error === 'ROOM_CLOSED'
        ? 'Ce salon a été fermé faute de joueurs.'
        : errorMessage(connection.error);
    return (
      <CenteredMessage title="Impossible de rejoindre" detail={message}>
        <Button variant="gold" display size="md" onClick={() => navigate('/')}>
          Retour aux salons
        </Button>
      </CenteredMessage>
    );
  }
  return (
    <GameScreen
      view={connection.view}
      events={connection.events}
      log={connection.log}
      clockOffset={connection.clockOffset}
      connected={connection.connected}
    />
  );
}

interface GameScreenProps {
  view: RoomView;
  events: GameEvent[];
  log: string[];
  clockOffset: number;
  connected: boolean;
}

function GameScreen({ view, events, log, clockOffset, connected }: GameScreenProps) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(rootRef);
  // Écran en portrait (téléphone) : scène mobile ; sinon la scène 1280×800 de la maquette.
  const layout = width > 0 && width / height < 0.75 ? MOBILE : DESKTOP;

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3_500);
    return () => clearTimeout(id);
  }, [toast]);

  const send: Send = useCallback(async (promise) => {
    setBusy(true);
    const res = await promise;
    setBusy(false);
    if (!res.ok) setToast(errorMessage(res.error));
  }, []);

  const onAction = (action: PlayerAction) => {
    if (!view.hand) return;
    void send(request('game:action', { handNumber: view.hand.handNumber, action }));
  };

  const { winnings, winningCards } = handOutcome(view);
  const center = centerContent(view, clockOffset, busy, send);
  const myTurn = view.you.legal !== null;
  const mobile = layout.name === 'mobile';

  return (
    <div ref={rootRef} className="h-dvh w-full overflow-hidden">
      <Stage width={layout.width} height={layout.height}>
        <TopBar
          view={view}
          layout={layout}
          clockOffset={clockOffset}
          connected={connected}
          send={send}
          busy={busy}
        />

        <Table
          view={view}
          events={events}
          clockOffset={clockOffset}
          layout={layout}
          onSit={(seat) => void send(request('seat:take', { seat }))}
          headline={center.headline}
          center={center.center}
        />

        <Hero
          view={view}
          events={events}
          clockOffset={clockOffset}
          layout={layout}
          winningCards={winningCards}
          winnings={view.you.seat === null ? 0 : (winnings.get(view.you.seat) ?? 0)}
        />

        {!(mobile && myTurn) && (
          <History lines={log} layout={layout}>
            {mobile && <SeatControls view={view} busy={busy} send={send} />}
          </History>
        )}

        <div className="absolute z-50" style={{ left: layout.actions.x, top: layout.actions.y }}>
          <ActionBar view={view} busy={busy} onAction={onAction} width={layout.actions.w} />
          {view.you.canRebuy && (
            <Button
              variant="gold"
              display
              size="lg"
              disabled={busy}
              style={{ width: layout.actions.w }}
              className={mobile ? 'mt-14' : 'mt-20'}
              onClick={() => void send(request('player:rebuy'))}
            >
              Me recaver · {formatChips(view.config.startingStack)}
            </Button>
          )}
        </div>

        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute left-1/2 z-[60] -translate-x-1/2 rounded-[10px] border border-danger/50 bg-surface px-4 py-2 text-[15px] text-danger shadow-xl"
              style={{ top: layout.topBar + 12 }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </Stage>
    </div>
  );
}

function TopBar({
  view,
  layout,
  clockOffset,
  connected,
  send,
  busy,
}: {
  view: RoomView;
  layout: StageLayout;
  clockOffset: number;
  connected: boolean;
  send: Send;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const mobile = layout.name === 'mobile';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(view.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.prompt('Copie ce lien :', roomUrl(view.id));
    }
  };

  return (
    <header
      className="absolute inset-x-0 top-0 z-50 flex items-center gap-4 border-b border-gold-soft px-6"
      style={{
        height: layout.topBar,
        paddingLeft: mobile ? 14 : 24,
        paddingRight: mobile ? 14 : 24,
      }}
    >
      <div className={`flex min-w-0 flex-1 ${mobile ? 'flex-col gap-0.5' : 'items-center gap-5'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <h1
            className="font-display truncate font-bold uppercase tracking-[0.06em] text-gold"
            style={{ fontSize: mobile ? 20 : 30, lineHeight: 1 }}
          >
            {view.name}
          </h1>
          <span className="shrink-0 rounded-full bg-wait-bg px-3 py-0.5 text-sm font-medium text-gold-light">
            {view.config.visibility === 'private' ? 'Privé' : 'Public'}
          </span>
        </div>
        <GameInfo view={view} clockOffset={clockOffset} mobile={mobile} />
      </div>
      {!connected && (
        <span className="shrink-0 rounded-full bg-danger/15 px-3 py-1 text-sm font-semibold text-danger">
          Reconnexion…
        </span>
      )}
      {!mobile && <SeatControls view={view} busy={busy} send={send} />}
      <Button variant="outlineGold" size={mobile ? 'sm' : 'md'} onClick={() => void copy()}>
        {copied ? 'Lien copié ✓' : mobile ? 'Inviter' : 'Copier le lien'}
      </Button>
      <Button variant="outline" size={mobile ? 'sm' : 'md'} onClick={() => navigate('/')}>
        Quitter
      </Button>
    </header>
  );
}

function GameInfo({
  view,
  clockOffset,
  mobile,
}: {
  view: RoomView;
  clockOffset: number;
  mobile: boolean;
}) {
  const now = useServerNow(clockOffset, 1_000);
  const { small, big, level, nextLevelAt } = view.blinds;
  const parts = [`Blinds ${formatChips(small)} / ${formatChips(big)}`];
  if (view.hand) parts.push(`Main n°${view.hand.handNumber}`);
  if (nextLevelAt !== null) {
    const seconds = Math.max(0, Math.round((nextLevelAt - now) / 1000));
    parts.push(
      `Niv. ${level + 1}, hausse dans ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    );
  }
  return (
    <span className={`tabular truncate text-text-2 ${mobile ? 'text-[13px]' : 'text-[17px]'}`}>
      {parts.join(' · ')}
    </span>
  );
}

function SeatControls({ view, busy, send }: { view: RoomView; busy: boolean; send: Send }) {
  const mySeat = view.you.seat;
  if (mySeat === null) return null;
  const seat = view.seats[mySeat]!;
  return (
    <div className="flex shrink-0 items-center gap-1">
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
        Me lever
      </Button>
    </div>
  );
}

function History({
  lines,
  layout,
  children,
}: {
  lines: string[];
  layout: StageLayout;
  children?: ReactNode;
}) {
  return (
    <div
      className="absolute z-40 flex flex-col gap-2"
      style={{ left: layout.history.x, top: layout.history.y, width: layout.history.w }}
    >
      <span className="text-[13px] font-medium uppercase tracking-[0.18em] text-text-3">
        Dernières actions
      </span>
      <div className="flex flex-col gap-1.5">
        {lines.slice(-3).map((line, i) => (
          <motion.span
            key={`${lines.length}-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="truncate text-[17px] text-text-2"
          >
            {line}
          </motion.span>
        ))}
        {lines.length === 0 && (
          <span className="text-[15px] text-text-3">Rien pour l’instant.</span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Que montrer au centre de la table : attente du lancement, résultat, pause, ou rien. */
function centerContent(view: RoomView, clockOffset: number, busy: boolean, send: Send) {
  const hand = view.hand;
  if (view.status === 'waiting') {
    return { headline: null, center: <WaitingMessage view={view} busy={busy} send={send} /> };
  }
  if (hand?.isComplete && hand.result) {
    return {
      headline: <ResultHeadline view={view} />,
      center: <ResultDetail view={view} clockOffset={clockOffset} />,
    };
  }
  if (!hand || hand.isComplete) {
    return { headline: null, center: <PausedMessage view={view} /> };
  }
  return { headline: null, center: null };
}

function spectatorHint(view: RoomView): string | null {
  return view.you.seat === null && view.seats.some((s) => s === null)
    ? 'Clique sur une place libre pour t’asseoir.'
    : null;
}

function WaitingMessage({ view, busy, send }: { view: RoomView; busy: boolean; send: Send }) {
  const seated = view.seats.filter(Boolean).length;
  const host = view.members.find((m) => m.isHost);
  const hint = spectatorHint(view);
  return (
    <div className="flex flex-col items-center gap-2">
      {view.you.isHost ? (
        <>
          <Button
            variant="gold"
            display
            size="lg"
            disabled={busy || seated < 2}
            onClick={() => void send(request('game:start'))}
          >
            Lancer la partie
          </Button>
          <span className="text-[15px] text-text-2">
            {seated < 2
              ? 'Il faut au moins 2 joueurs assis.'
              : `${seated} joueurs assis · copie le lien pour en inviter d’autres`}
          </span>
        </>
      ) : (
        <Pill>En attente du lancement par {host?.nickname ?? 'l’hôte'}…</Pill>
      )}
      {hint && <span className="text-[15px] text-gold-light">{hint}</span>}
    </div>
  );
}

function winnersOf(view: RoomView) {
  const totals = new Map<number, number>();
  for (const award of view.hand?.result?.awards ?? []) {
    for (const w of award.winners) totals.set(w.seat, (totals.get(w.seat) ?? 0) + w.amount);
  }
  const names = [...totals.keys()].map(
    (seat) => view.members.find((m) => m.publicId === view.seats[seat]?.publicId)?.nickname ?? '?',
  );
  const amount = [...totals.values()].reduce((a, b) => a + b, 0);
  const handName = view.hand?.result?.showdown.find((s) => totals.has(s.seat))?.name ?? null;
  return { names, amount, handName };
}

/** Résultat, à la place du pot : « Alice remporte 900 ». */
function ResultHeadline({ view }: { view: RoomView }) {
  const { names, amount } = winnersOf(view);
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.6 }}
      className="font-display inline-block rounded-full bg-gold px-5 py-1 text-[22px] font-bold text-on-gold shadow-[0_0_24px_rgba(212,166,74,0.35)]"
    >
      {names.length > 1
        ? `${names.join(' et ')} se partagent ${formatChips(amount)}`
        : `${names[0]} remporte ${formatChips(amount)}`}
    </motion.span>
  );
}

/** Sous le board : la main gagnante et le compte à rebours de la main suivante. */
function ResultDetail({ view, clockOffset }: { view: RoomView; clockOffset: number }) {
  const now = useServerNow(clockOffset, 500);
  const { handName } = winnersOf(view);
  const countdown =
    view.nextHandAt === null ? null : Math.max(0, Math.ceil((view.nextHandAt - now) / 1000));
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.8 }}
      className="flex flex-col items-center gap-1"
    >
      {handName && <span className="text-[17px] font-medium text-gold-light">{handName}</span>}
      {countdown !== null && (
        <span className="text-sm text-text-2">Prochaine main dans {countdown} s</span>
      )}
    </motion.div>
  );
}

function PausedMessage({ view }: { view: RoomView }) {
  const hint = spectatorHint(view);
  return (
    <div className="flex flex-col items-center gap-2">
      <Pill>En attente de joueurs…</Pill>
      {hint && <span className="text-[15px] text-gold-light">{hint}</span>}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-black/45 px-4 py-1.5 text-[15px] font-medium text-text-2">
      {children}
    </span>
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
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-4xl font-bold">{title}</h1>
      {detail && <p className="text-text-2">{detail}</p>}
      {children}
    </div>
  );
}
