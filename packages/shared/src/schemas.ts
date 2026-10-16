import { z } from 'zod';

/**
 * Validation des messages reçus du client. TypeScript ne protège rien à l'exécution :
 * un client modifié peut envoyer n'importe quoi, donc tout passe par ces schémas.
 * Le client s'en sert aussi pour valider ses formulaires : une seule source de vérité.
 */

/** Identifiant secret du navigateur (crypto.randomUUID côté client). */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const roomIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10}$/);

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, 'Pseudo requis')
  .max(16, '16 caractères maximum')
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'Lettres, chiffres, espaces, « _ », « . » et « - » uniquement');

export const createRoomSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis').max(30, '30 caractères maximum'),
    visibility: z.enum(['public', 'private']),
    maxSeats: z.int().min(2).max(9).default(6),
    startingStack: z.int().min(100).max(1_000_000).default(1000),
    blinds: z
      .object({
        small: z.int().min(1),
        big: z.int().min(2),
        /** null = blinds fixes. */
        increaseEveryMinutes: z.int().min(1).max(120).nullable(),
      })
      .refine((b) => b.big >= b.small, 'La grosse blind doit être ≥ la petite')
      .default({ small: 10, big: 20, increaseEveryMinutes: null }),
    onBust: z.enum(['rebuy', 'spectate']).default('rebuy'),
    turnSeconds: z.int().min(10).max(120).default(30),
  })
  .refine((r) => r.blinds.big <= r.startingStack, 'Le tapis doit couvrir la grosse blind');

export type CreateRoomInput = z.input<typeof createRoomSchema>;
export type RoomConfig = z.output<typeof createRoomSchema>;

export const joinRoomSchema = z.object({ roomId: roomIdSchema, nickname: nicknameSchema });

export const takeSeatSchema = z.object({ seat: z.int().min(0).max(8) });

export const sitOutSchema = z.object({ sittingOut: z.boolean() });

export const playerActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fold') }),
  z.object({ type: z.literal('check') }),
  z.object({ type: z.literal('call') }),
  z.object({ type: z.literal('raise'), to: z.int().min(1) }),
  z.object({ type: z.literal('allIn') }),
]);

export const gameActionSchema = z.object({
  /** Numéro de la main visée : un clic parti pendant la main précédente est rejeté. */
  handNumber: z.int().min(1),
  action: playerActionSchema,
});
