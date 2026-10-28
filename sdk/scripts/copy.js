import { copyFileSync, mkdirSync } from 'node:fs';

// the dashboard serves the sdk
mkdirSync('../client/public', { recursive: true });
copyFileSync('dist/rum.min.js', '../client/public/rum.min.js');
console.log('copied to client/public/rum.min.js');
