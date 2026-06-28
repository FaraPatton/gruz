import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/build-private-config.mjs /path/to/config.js');
  process.exit(1);
}

const source = readFileSync(input, 'utf8');
const config = runInNewContext(`${source}\n;({
  routeBaseAddress: typeof ROUTE_BASE_ADDRESS === 'undefined' ? '' : ROUTE_BASE_ADDRESS,
  executorMarkers: typeof EXECUTOR_MARKERS === 'undefined' ? [] : EXECUTOR_MARKERS,
  executorProfile: typeof EXECUTOR_PROFILE === 'undefined' ? {} : EXECUTOR_PROFILE,
  stampFileId: typeof STAMP_FILE_ID === 'undefined' ? '' : STAMP_FILE_ID
})`, Object.create(null), { timeout: 1000 });

process.stdout.write(JSON.stringify(config));
