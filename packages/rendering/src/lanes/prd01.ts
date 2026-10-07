/**
 * Lane prd01 barrel — owned by lane 01 (CONTRACTS.md §3.8). `provide()` calls
 * for that lane's real implementations live here; empty in PR 0a.
 */

import { instanceBufferSlot } from "../contracts/geometry";
import { frameUniformsSlot } from "../contracts/frameUniforms";
import { InstanceBuffer } from "../resources/InstanceBuffer";
import { FrameUniforms } from "../resources/UniformBlock";
import "../program/ProgramGenerator";
import { programCacheSlot } from "../contracts/program";
import { ProgramCache } from "../program/ProgramCache";

// C-07 real: persistent doubling buffer (stub was per-write full upload).
instanceBufferSlot.provide((device, capacity, options) => new InstanceBuffer(device, capacity, options));

// C-08 real: AuraFrame UBO at binding 0, uploaded once per view.
frameUniformsSlot.provide((device) => new FrameUniforms(device));

// C-02 real: generator-backed cache (KHR_parallel_shader_compile via
// device.probe / compileAsync when the backend supports it).
programCacheSlot.provide((device, options) => new ProgramCache(device, options));
