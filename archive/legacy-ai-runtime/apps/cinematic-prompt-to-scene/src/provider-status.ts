import { providerRequiresProxy, type ProviderMode } from "./provider-config";

export interface CinematicProviderStatus {
  readonly mode: ProviderMode;
  readonly label: string;
  readonly requiresProxy: boolean;
  readonly browserKeysAccepted: false;
}

export function createCinematicProviderStatus(mode: ProviderMode): CinematicProviderStatus {
  return {
    mode,
    label: mode,
    requiresProxy: providerRequiresProxy(mode),
    browserKeysAccepted: false
  };
}
