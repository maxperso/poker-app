import type { IncomingMessage } from 'node:http';

/** Garde-fous contre les abus : un site public doit tenir face à un client malveillant. */
export const LIMITS = {
  /** Connexions Socket.io simultanées par IP (une soirée entre amis = une seule box). */
  connectionsPerIp: 40,
  /** Salons existants au total, et par IP créatrice. */
  rooms: 200,
  roomsPerIp: 5,
  /** Membres (joueurs + spectateurs) par salon. */
  membersPerRoom: 30,
  /** Taille maximale d'un message Socket.io (une action fait ~100 octets). */
  maxMessageBytes: 16 * 1024,
  /** Débit : rafale de 30 messages, puis 10 par seconde. */
  burst: 30,
  perSecond: 10,
  /** Au-delà de ce nombre de messages refusés, la connexion est coupée. */
  maxViolations: 100,
};

/**
 * IP du client. Derrière Nginx Proxy Manager, la connexion vient du proxy : la vraie IP
 * est dans `X-Real-IP`, que NPM réécrit lui-même (un client ne peut pas l'imposer).
 * On ne lit ces en-têtes que si on sait être derrière un proxy de confiance
 * (TRUST_PROXY=1) ; sinon n'importe qui pourrait s'inventer une IP.
 */
export function clientIp(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const realIp = request.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
    // À défaut : la dernière entrée de X-Forwarded-For, ajoutée par le proxy.
    const forwarded = request.headers['x-forwarded-for'];
    const list = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? '')).split(',');
    const last = list
      .map((s) => s.trim())
      .filter(Boolean)
      .at(-1);
    if (last) return last;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

/**
 * Seau à jetons : on peut envoyer `capacity` messages d'un coup, puis le seau se remplit
 * de `perSecond` jetons par seconde. Un message sans jeton est refusé.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  take(): boolean {
    const now = this.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((now - this.last) / 1000) * this.perSecond,
    );
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Compteur par clé (ex. connexions ouvertes par IP). */
export class Counter {
  private readonly counts = new Map<string, number>();

  get(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  increment(key: string): void {
    this.counts.set(key, this.get(key) + 1);
  }

  decrement(key: string): void {
    const next = this.get(key) - 1;
    if (next <= 0) this.counts.delete(key);
    else this.counts.set(key, next);
  }
}
