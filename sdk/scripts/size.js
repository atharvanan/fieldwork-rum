import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_GZIP = 3 * 1024; // fail the build if the SDK grows past 3 KB gzipped
const file = readFileSync('dist/rum.min.js');
const gz = gzipSync(file).length;
console.log(`rum.min.js: ${file.length} B minified, ${gz} B gzipped (budget ${BUDGET_GZIP} B)`);
if (gz > BUDGET_GZIP) {
  console.error('SDK is over its size budget.');
  process.exit(1);
}
