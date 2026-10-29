// Offline checks for the modules the platform deploys (`tgcloud/**/*.js`).
//
// There is no local runtime: handlers execute in Telegram's V8 isolate, so this
// script covers the two failures that are cheapest to catch before a deploy:
//
//   1. a file that does not parse (`node --check`);
//   2. an import the runtime could not resolve — the platform exposes only `sdk`
//      and this project's own modules, addressed by relative path *with* `.js`.
//
// Behaviour that does not need the platform lives in `tests/` (`npm test`).
// To run a handler for real, use `npx tgcloud run <module> '<payload>'`.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const moduleRoot = join(projectRoot, 'tgcloud');

const IMPORT_SPECIFIER = /\bfrom\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

function checkImports(file) {
  const problems = [];
  const source = readFileSync(file, 'utf8');

  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1] ?? match[2];

    if (specifier === 'sdk' || specifier.startsWith('sdk/')) continue;

    if (!specifier.startsWith('.')) {
      problems.push(`"${specifier}" — only "sdk" or a relative "./…js" path can be imported`);
      continue;
    }
    if (!specifier.endsWith('.js')) {
      problems.push(`"${specifier}" — a relative import must end in ".js"`);
      continue;
    }
    if (!existsSync(resolve(dirname(file), specifier))) {
      problems.push(`"${specifier}" — no such file`);
    }
  }
  return problems;
}

const files = jsFiles(moduleRoot).sort();
let failed = 0;

for (const file of files) {
  const name = relative(projectRoot, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failed += 1;
    console.error(`✖ ${name}`);
    console.error(String(error.stderr ?? error.message).trim());
    continue;
  }

  for (const problem of checkImports(file)) {
    failed += 1;
    console.error(`✖ ${name}: ${problem}`);
  }
}

if (failed) {
  console.error(`\n${failed} problem(s) across ${files.length} module(s).`);
  process.exit(1);
}
console.log(`✔ ${files.length} module(s) parsed, imports resolved.`);
