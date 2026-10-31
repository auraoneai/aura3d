/**
 * Thermal Drift entry (GU47 PRD D11). The blind panel judged the GU47 foundry look worse than 4.6.2 in every circuit,
 * so the default boots the 4.6.2 presentation (`./original/main`); `?look=foundry` opts into the GU47 look (`./main`).
 * Both share the same frozen simulation, input, HUD and data modules.
 */
export type ThermalDriftLook = "original" | "foundry";

export function lookFromParam(value: string | null | undefined): ThermalDriftLook {
  return value === "foundry" ? "foundry" : "original";
}

if (typeof window !== "undefined") {
  const look = lookFromParam(new URLSearchParams(window.location.search).get("look"));
  // The foundry title card hides the race chrome (index.html `html.td-foundry body.td-card`); 4.6.2 kept it visible.
  if (look === "foundry") document.documentElement.classList.add("td-foundry");
  void (look === "foundry" ? import("./main") : import("./original/main"));
}
