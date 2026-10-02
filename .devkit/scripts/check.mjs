#!/usr/bin/env node
/**
 * pnpm devkit:check: keeps the agent rulebook in .devkit/ wired and free of local tool state.
 * - AGENTS.md as staged/committed imports .devkit/core.md and carries no AgentKit block, and its links resolve. The index
 *   is read, not the working tree, so a checkout where AgentKit wrote its local block still passes until someone stages it.
 * - .github/instructions/devkit.instructions.md is committed as an always-apply rule (`applyTo: '**'`) pointing to
 *   .devkit/core.md: omp gives subagents rules but not AGENTS.md, so this is how a subagent finds the rulebook.
 * - No file under .omp/ or .agentkit/ is tracked.
 * - Every relative Markdown link in AGENTS.md (index content), README.md, the instructions file and .devkit/**\/*.md
 *   (working tree) resolves.
 * - Every rule and workflow file is routed from core.md; every ADR is listed in decisions/README.md.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const devkit = join(root, '.devkit');
const errors = [];

/** Runs `git` in the repo; on failure reports one clean error line and returns `null`. */
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const reason = String(error.stderr || error.message)
      .trim()
      .split('\n')[0];
    errors.push(`git ${args.join(' ')}: ${reason}`);
    return null;
  }
};

// Index content of AGENTS.md: absent from the index (git show fails) reads as empty, so the `@.devkit/core.md` import
// is reported missing instead of crashing on the deleted file.
const agents = git('show', ':AGENTS.md') ?? '';
if (!agents.split('\n').some((line) => line.trim() === '@.devkit/core.md')) {
  errors.push('AGENTS.md: missing the line `@.devkit/core.md`');
}
if (agents.includes('AGENTKIT')) {
  errors.push('AGENTS.md: AgentKit block is staged/committed; keep it local (see .devkit/README.md)');
}

// Read from the index like AGENTS.md (what will be committed), and also required on disk: a tracked pointer missing
// from the checkout is never local tool state.
const POINTER = '.github/instructions/devkit.instructions.md';
const pointerTracked = (git('ls-files', '--', POINTER) ?? '').trim() !== '';
const pointer = pointerTracked ? (git('show', `:${POINTER}`) ?? '') : '';
// omp makes a github instructions rule always-apply only when its frontmatter `applyTo` is `*`, `**` or `**/*`, and
// demotes any rule with a TTSR key (`condition`, `astCondition`, `question`) to a stream trigger.
const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(pointer)?.[1] ?? '';
const alwaysApply = /^applyTo:\s*(['"]?)(\*|\*\*|\*\*\/\*)\1\s*(?:#.*)?$/m.test(frontmatter);
const ttsr = /^(condition|astCondition|question):/m.test(frontmatter);
const body = pointer.slice(pointer.indexOf(frontmatter) + frontmatter.length);
if (!alwaysApply || ttsr || !body.includes('.devkit/core.md') || !existsSync(join(root, POINTER))) {
  errors.push(
    `${POINTER}: must exist and be committed as an always-apply rule (frontmatter \`applyTo: '**'\`, no condition/question keys) whose body points to .devkit/core.md; subagents read it instead of AGENTS.md`,
  );
}

for (const file of (git('ls-files', '--', '.omp', '.agentkit') ?? '').split('\n').filter(Boolean)) {
  errors.push(`${file}: local AgentKit state must not be tracked`);
}

/** Text with fenced code blocks (` ``` ` and `~~~`, indented up to 3 spaces) and inline code spans removed. */
function stripCode(text) {
  let fence = null;
  const kept = [];
  for (const line of text.split('\n')) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence === null) {
      if (marker) fence = marker[1][0];
      else kept.push(line);
    } else if (marker && marker[1][0] === fence && /^\s*$/.test(line.slice(marker[0].length))) {
      fence = null;
    }
  }
  return kept.join('\n').replace(/(`+)[\s\S]*?\1/g, '');
}

/**
 * Relative link targets of Markdown text: inline links `[x](target)` with an optional title, angle-bracket targets
 * `[x](<my file.md>)`, and reference definitions `[x]: target`. Skips `scheme:` targets (http, mailto, …) and bare
 * `#anchor`s; `#fragment` is stripped before resolving.
 */
function links(text) {
  const targets = [];
  for (const match of stripCode(text).matchAll(
    /\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+['"(][^)]*)?\s*\)|^\s*\[(?!\^)[^\]]+\]:\s*(\S+)/gm,
  )) {
    targets.push(match[1] ?? match[2] ?? match[3]);
  }
  return targets.map((target) => target.split('#')[0]).filter((target) => target && !/^[a-z]+:/i.test(target));
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

// AGENTS.md is checked from the index (agents) so a local, unstaged AgentKit block is never link-checked; other docs
// are read from the working tree.
const docs = [
  { file: join(root, 'AGENTS.md'), text: agents },
  ...[join(root, 'README.md'), join(root, POINTER), ...markdownFiles(devkit)]
    .filter((file) => existsSync(file))
    .map((file) => ({ file, text: readFileSync(file, 'utf8') })),
];
for (const { file, text } of docs) {
  for (const target of links(text)) {
    if (!existsSync(join(dirname(file), target))) {
      errors.push(`${relative(root, file)}: broken link ${target}`);
    }
  }
}

const linkedFrom = (file) => new Set(links(readFileSync(file, 'utf8')).map((target) => join(dirname(file), target)));

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
