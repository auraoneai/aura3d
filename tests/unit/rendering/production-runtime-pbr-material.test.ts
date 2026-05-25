import { describe, expect, it } from 'vitest';
import { V6_PBR_SHADER_FEATURES } from '../../../packages/rendering/src/production-runtime/materials/PBRShaderFeatures';
describe('V6 PBR material contract', () => { it('keeps advanced PBR shader features exposed', () => { expect(V6_PBR_SHADER_FEATURES.clearcoat).toBe(true); expect(V6_PBR_SHADER_FEATURES.transmission).toBe(true); }); });
