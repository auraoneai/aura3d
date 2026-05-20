export interface Camera { readonly projectionMatrix: readonly number[]; readonly viewMatrix: readonly number[]; readonly exposure?: number; readonly near?: number; readonly far?: number; }
