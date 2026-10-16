import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DELAYS } from '../src/rooms/Room';
import { type HandStat, playerKey, StatsStore } from '../src/stats/StatsStore';
import { expectOk, HOST, makeRoom, seatPlayers, token, tokenToAct } from './helpers';

const stat = (name: string, net: number, potWon = 0): HandStat => ({
  token: token(name),
  nickname: name,
  color: '#e8b04f',
  net,
  won: potWon > 0,
  potWon,
});

describe('StatsStore', () => {
  test('cumule mains jouées, mains gagnées, gains nets et plus gros pot', () => {
    const store = new StatsStore(null);
    store.record([stat('alice', 40, 60), stat('bob', -40)]);
    store.record([stat('alice', -20), stat('bob', 20, 40)]);
    expect(store.leaderboard()).toMatchObject([
      { nickname: 'alice', handsPlayed: 2, handsWon: 1, net: 20, biggestPot: 60 },
      { nickname: 'bob', handsPlayed: 2, handsWon: 1, net: -20, biggestPot: 40 },
    ]);
  });

  test('l’identifiant public ne révèle pas le jeton secret', () => {
    const store = new StatsStore(null);
    store.record([stat('alice', 10, 10)]);
    const [entry] = store.leaderboard();
    expect(entry?.id).toBe(playerKey(token('alice')));
    expect(JSON.stringify(store.leaderboard())).not.toContain(token('alice'));
  });

  test('le pseudo affiché est le plus récent', () => {
    const store = new StatsStore(null);
    store.record([stat('alice', 10, 10)]);
    store.record([{ ...stat('alice', 5, 5), nickname: 'Alice la Reine' }]);
    expect(store.leaderboard()[0]?.nickname).toBe('Alice la Reine');
  });

  describe('sauvegarde sur disque', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'poker-stats-'));
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    test('ce qui est écrit est relu au redémarrage', async () => {
      const file = join(dir, 'stats.json');
      const first = new StatsStore(file);
      first.record([stat('alice', 40, 60)]);
      await first.flush();

      const second = new StatsStore(file);
      await second.load();
      expect(second.leaderboard()).toMatchObject([{ nickname: 'alice', net: 40 }]);
      expect(await readFile(file, 'utf8')).not.toContain(token('alice'));
    });

    test('un fichier corrompu ou forgé est ignoré, sans planter', async () => {
      const file = join(dir, 'stats.json');
      await writeFile(
        file,
        '{"version":1,"players":{"x":{"nickname":"<script>","handsPlayed":-5}}}',
      );
      const store = new StatsStore(file);
      await store.load();
      expect(store.leaderboard()).toEqual([]);
      await writeFile(file, 'pas du json');
      await store.load();
      expect(store.leaderboard()).toEqual([]);
    });
  });
});

describe('le salon rapporte chaque main', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('les gains et pertes d’une main s’équilibrent', () => {
    const reports: HandStat[][] = [];
    const { room } = makeRoom({}, 1, (s) => reports.push(s));
    seatPlayers(room, ['host', 'bob', 'carol']);
    expectOk(room.start(HOST));
    while (!room.table.hand?.isComplete) {
      expectOk(room.act(tokenToAct(room), room.table.hand!.handNumber, { type: 'fold' }));
    }
    expect(reports).toHaveLength(1);
    const hand = reports[0]!;
    expect(hand).toHaveLength(3);
    expect(hand.reduce((sum, s) => sum + s.net, 0)).toBe(0);
    expect(hand.filter((s) => s.won)).toHaveLength(1);
    vi.advanceTimersByTime(DELAYS.afterFold);
  });
});
