#!/usr/bin/env node
/**
 * Lists tests whose title contains an acceptance-criterion id (AC-…), e.g. it('AC-X-DEMO-01-02 từ chối khi hết hạn', …).
 *
 *   pnpm ac                 one line per test: <AC id>\t<file>:<line>\t<test title>
 *   pnpm ac --json          ac_covered array: [{"id": "AC-…", "tests": ["<test title>"]}]
 *   pnpm ac AC-X-DEMO-01    only ids starting with the given prefix(es)
 *
 * Only string-literal titles of it()/test() (plain, .only or .concurrent) are read; skipped/todo tests do not count.
 * Prints nothing (or [] with --json) when no test carries an AC id.
 */
import { glob, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const json = args.includes('--json');
const prefixes = args.filter((arg) => arg !== '--json');

const TEST_FILES = ['apps/*/{src,test,e2e}/**/*.{spec,test,e2e-spec}.{ts,tsx}'];
const TEST_CALL = /\b(?:it|test)(?:\.(?:only|concurrent))*\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const AC_ID = /\bAC(?:-[A-Z0-9]+)+\b/g;

const hits = [];
for await (const file of glob(TEST_FILES, { cwd: root, exclude: (name) => name === 'node_modules' })) {
  const source = await readFile(join(root, file), 'utf8');
  for (const match of source.matchAll(TEST_CALL)) {
    const title = match[2];
    const line = source.slice(0, match.index).split('\n').length;
    for (const id of new Set(title.match(AC_ID))) {
      if (prefixes.length === 0 || prefixes.some((prefix) => id.startsWith(prefix))) hits.push({ id, file, line, title });
    }
  }
}

hits.sort((a, b) => a.id.localeCompare(b.id) || a.file.localeCompare(b.file) || a.line - b.line);

if (json) {
  const covered = new Map();
  for (const { id, title } of hits) covered.set(id, [...(covered.get(id) ?? []), title]);
  console.log(JSON.stringify([...covered].map(([id, tests]) => ({ id, tests })), null, 2));
} else {
  for (const { id, file, line, title } of hits) console.log(`${id}\t${file}:${line}\t${title}`);
}
