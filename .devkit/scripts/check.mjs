#!/usr/bin/env node
/**
 * pnpm devkit:check: keeps the agent rulebook in .devkit/ wired and free of local tool state.
 *
 * - AGENTS.md as staged/committed imports .devkit/core.md and carries no AgentKit block. The index is read, not the
 *   working tree, so a checkout where AgentKit wrote its local block still passes until someone stages it.
 * - No file under .omp/ or .agentkit/ is tracked.
 * - Every relative Markdown link in AGENTS.md and .devkit/**\/*.md resolves.
 * - Every rule and workflow file is routed from core.md; every ADR is listed in decisions/README.md.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const devkit = join(root, '.devkit');
const errors = [];

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

const agents = git('show', ':AGENTS.md');
if (!agents.split('\n').some((line) => line.trim() === '@.devkit/core.md')) {
  errors.push('AGENTS.md: missing the line `@.devkit/core.md`');
}
if (agents.includes('AGENTKIT')) {
  errors.push('AGENTS.md: AgentKit block is staged/committed; keep it local (see .devkit/README.md)');
}

for (const file of git('ls-files', '--', '.omp', '.agentkit').split('\n').filter(Boolean)) {
  errors.push(`${file}: local AgentKit state must not be tracked`);
}

/** Relative link targets of a Markdown file, outside fenced code blocks, without #anchors. */
function links(file) {
  const text = readFileSync(file, 'utf8').replace(/^```[\s\S]*?^```/gm, '');
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1].split('#')[0])
    .filter((target) => target && !/^[a-z]+:/i.test(target));
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

const docs = [join(root, 'AGENTS.md'), ...markdownFiles(devkit)];
for (const file of docs) {
  for (const target of links(file)) {
    if (!existsSync(join(dirname(file), target))) {
      errors.push(`${relative(root, file)}: broken link ${target}`);
    }
  }
}

const linkedFrom = (file) => new Set(links(file).map((target) => join(dirname(file), target)));

const routed = linkedFrom(join(devkit, 'core.md'));
for (const dir of ['rules', 'workflows']) {
  for (const file of markdownFiles(join(devkit, dir))) {
    if (!routed.has(file)) errors.push(`${relative(root, file)}: not in the routing table of .devkit/core.md`);
  }
}

const listed = linkedFrom(join(devkit, 'decisions', 'README.md'));
for (const name of readdirSync(join(devkit, 'decisions'))) {
  const file = join(devkit, 'decisions', name);
  if (/^\d{4}-.+\.md$/.test(name) && !listed.has(file)) {
    errors.push(`${relative(root, file)}: not listed in .devkit/decisions/README.md`);
  }
}

if (errors.length > 0) {
  console.error(`devkit:check failed:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  process.exit(1);
}
console.log('devkit:check ok');
