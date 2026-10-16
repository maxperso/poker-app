import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DELAYS } from '../src/rooms/Room';
import { expectOk, HOST, makeRoom, seatPlayers, token, tokenToAct } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('membres', () => {
  test('pseudo unique, sans tenir compte de la casse ni des accents', () => {
    const { room } = makeRoom();
    expectOk(room.join(token('a'), 'Élodie'));
    expect(room.join(token('b'), 'elodie')).toEqual({ ok: false, error: 'NICKNAME_TAKEN' });
    expectOk(room.join(token('b'), 'Bob'));
  });

  test('revenir avec le même jeton : même identité, pseudo modifiable', () => {
    const { room } = makeRoom();
    expectOk(room.join(token('a'), 'Alice'));
    const before = room.members.get(token('a'))?.publicId;
    expectOk(room.join(token('a'), 'Alice2'));
    expect(room.members.size).toBe(1);
    expect(room.members.get(token('a'))).toMatchObject({ publicId: before, nickname: 'Alice2' });
  });

  test("l'hôte qui part transmet le rôle au membre le plus ancien", () => {
    const { room } = makeRoom();
    expectOk(room.join(HOST, 'Hôte'));
    vi.advanceTimersByTime(10);
    expectOk(room.join(token('b'), 'Bob'));
    vi.advanceTimersByTime(10);
    expectOk(room.join(token('c'), 'Carol'));
    expectOk(room.leave(HOST));
    expect(room.hostToken).toBe(token('b'));
  });

  test('salon vide : emptySince est renseigné', () => {
    const { room } = makeRoom();
    expectOk(room.join(token('a'), 'Alice'));
    expect(room.emptySince).toBeNull();
    expectOk(room.leave(token('a')));
    expect(room.emptySince).not.toBeNull();
  });
});

describe('lancement', () => {
  test("seul l'hôte lance, avec au moins 2 joueurs assis", () => {
    const { room } = makeRoom();
    const [, bob] = seatPlayers(room, ['host', 'bob']);
    expect(room.start(bob as string)).toEqual({ ok: false, error: 'NOT_HOST' });
    expectOk(room.leaveSeat(bob as string));
    expect(room.start(HOST)).toEqual({ ok: false, error: 'NOT_ENOUGH_PLAYERS' });
    expectOk(room.takeSeat(bob as string, 1));
    expectOk(room.start(HOST));
    expect(room.status).toBe('playing');
    expect(room.table.hand?.handNumber).toBe(1);
    expect(room.start(HOST)).toEqual({ ok: false, error: 'ALREADY_STARTED' });
  });

  test('une action portant sur une ancienne main est rejetée', () => {
    const { room } = makeRoom();
    seatPlayers(room, ['host', 'bob']);
    expectOk(room.start(HOST));
    expect(room.act(tokenToAct(room), 99, { type: 'fold' })).toEqual({
      ok: false,
      error: 'STALE_HAND',
    });
  });

  test('chaque changement notifie la couche réseau avec les événements', () => {
    const { room, changes } = makeRoom();
    seatPlayers(room, ['host', 'bob']);
    const seqBefore = room.seq;
    expectOk(room.start(HOST));
    expect(room.seq).toBe(seqBefore + 1);
    expect(changes.at(-1)?.map((e) => e.type)).toContain('handStarted');
  });
});

describe('minuteries', () => {
  test('temps écoulé : action par défaut, puis main suivante après une pause', () => {
    const { room } = makeRoom({ turnSeconds: 20 });
    seatPlayers(room, ['host', 'bob']);
    expectOk(room.start(HOST));
    expect(room.turnDeadline).toBe(Date.now() + 20_000);

    // Heads-up : le bouton (petite blind) doit 10 de plus → il se couche au bout de 20 s.
    vi.advanceTimersByTime(20_000);
    expect(room.table.hand?.isComplete).toBe(true);
    expect(room.nextHandAt).toBe(Date.now() + DELAYS.afterFold);

    vi.advanceTimersByTime(DELAYS.afterFold);
    expect(room.table.hand?.handNumber).toBe(2);
    expect(room.table.hand?.isComplete).toBe(false);
  });

  test("un joueur déconnecté qui laisse filer son tour est mis absent et n'est plus servi", () => {
    const { room } = makeRoom();
    seatPlayers(room, ['host', 'bob', 'carol']);
    expectOk(room.start(HOST));
    const absent = tokenToAct(room);
    room.disconnect(absent);
    vi.advanceTimersByTime(30_000);

    const seat = room.seatOf(absent) as number;
    expect(room.table.seats[seat]?.sittingOut).toBe(true);

    // Les autres finissent la main, la suivante se joue sans lui.
    while (!room.table.hand?.isComplete)
      expectOk(room.act(tokenToAct(room), room.table.hand!.handNumber, { type: 'fold' }));
    vi.advanceTimersByTime(DELAYS.afterShowdown);
    expect(room.table.hand?.players.map((p) => p.seat)).not.toContain(seat);
  });

  test('se mettre absent quand c’est son tour : on joue pour lui tout de suite', () => {
    const { room } = makeRoom();
    seatPlayers(room, ['host', 'bob', 'carol']);
    expectOk(room.start(HOST));
    const player = tokenToAct(room);
    expectOk(room.setSittingOut(player, true));
    expect(tokenToAct(room)).not.toBe(player);
  });

  test('blinds croissantes : le niveau monte avec le temps', () => {
    const { room, events } = makeRoom({ blinds: { small: 10, big: 20, increaseEveryMinutes: 5 } });
    seatPlayers(room, ['host', 'bob']);
    expectOk(room.start(HOST));
    expect(room.nextBlindLevelAt()).toBe(Date.now() + 5 * 60_000);
    // Les mains se jouent toutes seules (temps écoulé) pendant un peu plus de 5 minutes.
    vi.advanceTimersByTime(5 * 60_000 + 60_000);
    expect(room.blindLevel).toBe(1);
    expect(room.currentBlinds()).toEqual({ small: 15, big: 30 });
    expect(events()).toContainEqual({ type: 'blindsIncreased', level: 1, small: 15, big: 30 });
  });
});

describe('départs et éliminations', () => {
  test('quitter son siège pendant son tour : il se couche, la place se libère à la fin de la main', () => {
    const { room } = makeRoom();
    seatPlayers(room, ['host', 'bob', 'carol']);
    expectOk(room.start(HOST));
    const leaver = tokenToAct(room);
    expectOk(room.leaveSeat(leaver));
    const seat = room.seatOf(leaver) as number;
    expect(room.table.hand?.players.find((p) => p.seat === seat)?.folded).toBe(true);

    while (!room.table.hand?.isComplete)
      expectOk(room.act(tokenToAct(room), room.table.hand!.handNumber, { type: 'fold' }));
    expect(room.seatOf(leaver)).toBeNull();
    expect(room.members.has(leaver)).toBe(true); // toujours là, en spectateur
  });

  test('quitter le salon pendant une main : retiré à la fin de la main', () => {
    const { room } = makeRoom();
    const [, bob] = seatPlayers(room, ['host', 'bob', 'carol']);
    expectOk(room.start(HOST));
    expectOk(room.leave(bob as string));
    expect(room.members.has(bob as string)).toBe(true);
    while (!room.table.hand?.isComplete)
      expectOk(room.act(tokenToAct(room), room.table.hand!.handNumber, { type: 'fold' }));
    expect(room.members.has(bob as string)).toBe(false);
  });

  function playAllIn(onBust: 'rebuy' | 'spectate') {
    const made = makeRoom({ onBust });
    seatPlayers(made.room, ['host', 'bob']);
    expectOk(made.room.start(HOST));
    const n = made.room.table.hand!.handNumber;
    expectOk(made.room.act(tokenToAct(made.room), n, { type: 'allIn' }));
    expectOk(made.room.act(tokenToAct(made.room), n, { type: 'call' }));
    expect(made.room.table.hand?.isComplete).toBe(true);
    const busted = made.events().find((e) => e.type === 'playerBusted');
    if (!busted || busted.type !== 'playerBusted')
      throw new Error('Graine fixe : un joueur doit être éliminé');
    return { ...made, busted };
  }

  test('éliminé, mode spectateur : il quitte son siège mais reste dans le salon', () => {
    const { room, busted } = playAllIn('spectate');
    expect(room.table.seats[busted.seat]).toBeNull();
    expect(room.memberByPublicId(busted.publicId)).toBeDefined();
  });

  test('éliminé, mode recave : il garde son siège et peut se recaver', () => {
    const { room, busted } = playAllIn('rebuy');
    const member = room.memberByPublicId(busted.publicId)!;
    expect(room.canRebuy(busted.seat)).toBe(true);
    expect(room.nextHandAt).not.toBeNull(); // la pause est programmée…
    vi.advanceTimersByTime(DELAYS.afterShowdown);
    expect(room.table.hand?.isComplete).toBe(true); // …mais un seul joueur servi : partie en pause

    expectOk(room.rebuy(member.token));
    expect(room.table.seats[busted.seat]?.stack).toBe(1000);
    vi.advanceTimersByTime(DELAYS.resume);
    expect(room.table.hand?.handNumber).toBe(2);
  });

  test('recave refusée si le salon ne le permet pas ou si on a encore des jetons', () => {
    const { room } = makeRoom({ onBust: 'spectate' });
    seatPlayers(room, ['host', 'bob']);
    expect(room.rebuy(HOST)).toEqual({ ok: false, error: 'CANNOT_REBUY' });
  });

  test('un joueur assis pendant une main attend la suivante', () => {
    const { room } = makeRoom();
    seatPlayers(room, ['host', 'bob']);
    expectOk(room.start(HOST));
    expectOk(room.join(token('carol'), 'Carol'));
    expectOk(room.takeSeat(token('carol'), 2));
    expect(room.table.hand?.players).toHaveLength(2);
    while (!room.table.hand?.isComplete)
      expectOk(room.act(tokenToAct(room), room.table.hand!.handNumber, { type: 'fold' }));
    vi.advanceTimersByTime(DELAYS.afterFold);
    expect(room.table.hand?.players).toHaveLength(3);
  });
});
