export interface InstallBlock {text:string;scope:string;context:string}
export function collectRenderedInstallEvidence():{text:string;installBlocks:InstallBlock[]};
export function validateVisibleInstallPins(blocks:InstallBlock[],version:string):string[];
export function validateOriginObservation(observation:unknown,plan:unknown):string[];
export function verifyReleaseOrigin(options:unknown):Promise<unknown>;
