import { install } from './guard.ts';
try { install({ name: 'device-link', limit: 120, windowSec: 60 }); } catch (_e) { /* run unguarded rather than fail */ }
await import('./original.ts');
