import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const runGit = (...args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr.trim() || `git ${args.join(' ')} failed`);
    process.exit(result.status || 1);
  }
  return result.stdout;
};

const trackedFiles = runGit('ls-files', '-z').split('\0').filter(Boolean);
const failures = [];

if (trackedFiles.includes('js/config.js')) {
  failures.push('js/config.js is tracked by git; it must remain runtime-only.');
}

const secretPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub access token', /gh[pousr]_[0-9A-Za-z]{36,}/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Slack token', /xox[baprs]-[0-9A-Za-z-]{20,}/],
  ['Stripe live secret', /sk_live_[0-9A-Za-z]{20,}/]
];

for (const file of trackedFiles) {
  const contents = readFileSync(file);
  if (contents.includes(0)) continue;

  const text = contents.toString('utf8');
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) failures.push(`${file}: possible ${label}`);
  }
}

const scriptFiles = trackedFiles.filter(file =>
  (file.startsWith('js/') || file.startsWith('scripts/')) &&
  ['.js', '.mjs'].includes(extname(file))
);

for (const file of scriptFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push(`${file}: JavaScript syntax check failed\n${result.stderr.trim()}`);
  }
}

if (failures.length) {
  console.error('Security baseline failed:\n');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Security baseline passed: ${trackedFiles.length} tracked files, ${scriptFiles.length} scripts checked.`);
