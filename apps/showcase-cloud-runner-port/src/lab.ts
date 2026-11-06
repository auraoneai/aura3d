/** Lab flags (default OFF): ?backend=auto|webgpu and ?gamut=p3 map to createAuraApp option fragments via the shared parser. */
import { labAppOptions, readLabFlags } from "../../showcase-port-shared/lab-flags";

(window as unknown as { __AURA_LAB_APP_OPTIONS__?: unknown }).__AURA_LAB_APP_OPTIONS__ = labAppOptions(readLabFlags());
