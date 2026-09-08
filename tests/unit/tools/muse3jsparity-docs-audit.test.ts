import { describe,it,expect } from 'vitest';
import { scanPublicSource } from '../../../tools/muse3jsparity-docs-audit/index';
import { claimSurfaceCompatible } from '../../../tools/muse3jsparity-docs-audit/claims';
describe('source audit canonical findings',()=>{
 it('rejects imported model aliases and require/dynamic Three imports',()=>{
 const findings=scanPublicSource('apps/test/main.ts',`import {model as hero} from '@aura3d/engine'; hero('made-up'); require('three'); import('three/addons/test');`);
 expect(findings.map(f=>f.rule)).toContain('string-model-id');expect(findings.map(f=>f.rule)).toContain('forbidden-three-import');
 });
 it('distinguishes typed public assets from relative raw model URLs',()=>{
 expect(scanPublicSource('apps/test/main.ts','model(assets.hero)').filter(f=>f.severity==='error')).toEqual([]);
 expect(scanPublicSource('apps/test/main.ts',`fetch('../assets/hero.glb')`).map(f=>f.rule)).toContain('raw-model-url');
 });
 it('keeps DOM and primitive context unresolved rather than declaring them safe',()=>{
 expect(scanPublicSource('apps/test/main.ts',`primitives.sphere({});document.createElement('canvas')`).map(f=>f.severity)).toEqual(['review']);
 expect(scanPublicSource('docs/test.md','# Full parity').map(f=>f.rule)).toContain('full-document-semantic-review');
 });
});
describe('final claim surface ownership',()=>{
 it('rejects root claims backed only by internal or misleadingly worded receipts',()=>{
 expect(claimSurfaceCompatible('createAuraApp root safe API','rendering package')).toBe(false);
 expect(claimSurfaceCompatible('createAuraApp root safe API','rendering package, not createAuraApp root safe API')).toBe(false);
 expect(claimSurfaceCompatible('createAuraApp root safe API','createAuraApp root safe API')).toBe(true);
 expect(claimSurfaceCompatible('universal','universal')).toBe(false);
 });
});
