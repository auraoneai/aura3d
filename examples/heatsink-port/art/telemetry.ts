/**
 * GU47 IC-23 ion telemetry HUD state: the district accent colour and a district banner that shows the moment the drone
 * enters a new district (same frame, well inside the 0.2 s acceptance) and holds for `BANNER_SECONDS`. Pure; the DOM
 * writes live in main.ts and only run under the twilight look (`?look=original` keeps today's HUD).
 */
export const BANNER_SECONDS = 2.4;

export interface TelemetryState {
  district: string;
  label: string;
  color: string;
  bannerT: number;
}

export const createTelemetry = (): TelemetryState => ({ district: "", label: "", color: "#40e0ff", bannerT: 0 });

/** advance one frame; returns true when the banner or accent changed (the caller then writes the DOM) */
export function stepTelemetry(st: TelemetryState, district: { readonly name: string; readonly hud: { readonly color: string; readonly label: string } }, racing: boolean, dt: number): boolean {
  let changed = false;
  if (district.name !== st.district) {
    const first = st.district === "";
    st.district = district.name; st.label = district.hud.label; st.color = district.hud.color;
    st.bannerT = racing && !first ? BANNER_SECONDS : 0;
    changed = true;
  } else if (st.bannerT > 0) {
    st.bannerT = Math.max(0, st.bannerT - dt);
    if (st.bannerT === 0) changed = true;
  }
  return changed;
}
