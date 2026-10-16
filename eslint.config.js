import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Le moteur reste pur : pas de réseau, pas d'API Node, pas de hasard caché.
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'socket.io*', 'express'],
              message: 'Le moteur ne dépend ni du réseau ni de Node.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Le hasard est injecté (rng) : crypto.randomInt en prod, valeurs fixes en test.',
        },
      ],
    },
  },
);
