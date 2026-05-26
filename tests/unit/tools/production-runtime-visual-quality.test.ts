import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
describe('Production visual quality contract files', () => { it('has a gallery manifest when visuals have run', () => { expect(existsSync(resolve('tests/reports/production-runtime-gallery/manifest.json'))).toBe(true); }); });
