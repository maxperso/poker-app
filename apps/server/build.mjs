import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Les packages du monorepo (@poker/*) sont intégrés au bundle : ils exportent du TypeScript.
// Les dépendances npm restent des imports classiques, installées dans l'image Docker.
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@poker/'));

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external,
  logLevel: 'info',
});
