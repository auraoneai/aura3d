/**
 * Thermal Drift entry (GU47 PRD D11, phase 3). The GU47 foundry look (`./main`) is the default in every circuit: after the
 * boot fix (the heat-haze `u_time` redefinition) and the phase-3 presentation pass, the blind 3-judge panel picked it
 * over the 4.6.2 frame in all three circuits (round g03p3r2: 3/0/0 each). `?look=original` boots the 4.6.2 presentation
 * (`./original/main`). Both share the same frozen simulation, input, HUD and data modules.
 */
export type ThermalDriftLook = "original" | "foundry";

export function lookFromParam(value: string | null | undefined): ThermalDriftLook {
  return value === "original" ? "original" : "foundry";
}

if (typeof window !== "undefined") {
  const look = lookFromParam(new URLSearchParams(window.location.search).get("look"));
  // The foundry title card hides the touch pad and glazes (index.html `html.td-foundry body.td-card`).
  if (look === "foundry") document.documentElement.classList.add("td-foundry");
  void (look === "foundry" ? import("./main") : import("./original/main"));
}
