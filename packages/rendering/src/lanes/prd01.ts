/**
 * Lane prd01 barrel — owned by lane 01 (CONTRACTS.md §3.8). `provide()` calls
 * for that lane's real implementations live here; empty in PR 0a.
 */

import { instanceBufferSlot } from "../contracts/geometry";
import { InstanceBuffer } from "../resources/InstanceBuffer";

// C-07 real: persistent doubling buffer (stub was per-write full upload).
instanceBufferSlot.provide((device, capacity, options) => new InstanceBuffer(device, capacity, options));
