import { describe, expect, it } from 'vitest';
import { PRODUCTION_PBR_SHADER_FEATURES } from '../../../packages/rendering/src/production-runtime/materials/PBRShaderFeatures';
describe('Production PBR material contract', () => { it('keeps advanced PBR shader features exposed', () => { expect(PRODUCTION_PBR_SHADER_FEATURES.clearcoat).toBe(true); expect(PRODUCTION_PBR_SHADER_FEATURES.transmission).toBe(true); }); });
