import { AURA_CLASH_ROUTES, type AuraClashRoute } from "../seo";

export type AuraClashReadinessStatus = "ready" | "verify";

export type AuraClashReadinessItem = {
  readonly id: string;
  readonly label: string;
  readonly status: AuraClashReadinessStatus;
  readonly owner: "seo" | "accessibility" | "evidence" | "deploy" | "poster";
  readonly route?: AuraClashRoute;
  readonly detail: string;
};

export type AuraClashRouteReadiness = {
  readonly route: AuraClashRoute;
  readonly label: string;
  readonly description: string;
  readonly checks: readonly AuraClashReadinessItem[];
};

export type AuraClashDeployReadinessChecklist = {
  readonly title: string;
  readonly summary: string;
  readonly requiredRoutes: readonly AuraClashRoute[];
  readonly globalChecks: readonly AuraClashReadinessItem[];
  readonly routeChecks: readonly AuraClashRouteReadiness[];
};

const ready = (
  id: string,
  label: string,
  owner: AuraClashReadinessItem["owner"],
  detail: string,
  route?: AuraClashRoute
): AuraClashReadinessItem => ({
  id,
  label,
  status: "ready",
  owner,
  detail,
  ...(route ? { route } : {})
});

const verify = (
  id: string,
  label: string,
  owner: AuraClashReadinessItem["owner"],
  detail: string,
  route?: AuraClashRoute
): AuraClashReadinessItem => ({
  id,
  label,
  status: "verify",
  owner,
  detail,
  ...(route ? { route } : {})
});

export const auraClashDeployReadinessChecklist: AuraClashDeployReadinessChecklist = {
  title: "Aura Clash deploy readiness",
  summary:
    "Release checklist data for Aura Clash final /showcase/aura-clash route metadata, canonical URLs, social descriptions, evidence, accessibility, and poster readiness.",
  requiredRoutes: AURA_CLASH_ROUTES,
  globalChecks: [
    ready(
      "seo-route-coverage",
      "All public routes have metadata records",
      "seo",
      "Metadata exists for /playable/, /evidence/, /accessibility/, /deploy-check/, and /poster/."
    ),
    ready(
      "seo-canonical-coverage",
      "Canonical URLs are generated from route-safe paths",
      "seo",
      "Canonical URLs are derived from the shared Aura Clash route list under https://aura3d.auraone.ai/showcase/aura-clash/."
    ),
    ready(
      "social-description-coverage",
      "Social descriptions are available for every route",
      "seo",
      "Each route includes share-card title, description, image alt text, and a large-summary card type."
    ),
    verify(
      "release-target-origin",
      "Production origin matches the deploy target",
      "deploy",
      "Confirm Vercel serves /showcase/aura-clash/ and all GLB URLs from the deployed aura3d.auraone.ai host."
    )
  ],
  routeChecks: [
    {
      route: "/playable/",
      label: "Playable route",
      description:
        "Confirms the primary Aura Clash demo route is ready for players and social previews.",
      checks: [
        ready(
          "playable-metadata",
          "Playable metadata describes the real-time 3D demo",
          "seo",
          "Title and description focus on the browser-playable combat loop, arena pacing, controls, and Aura3D scene behavior.",
          "/playable/"
        ),
        verify(
          "playable-interaction-proof",
          "Playable route presents the current interaction loop",
          "evidence",
          "Before release, confirm the route still shows controls, arena state, and the intended 3D experience.",
          "/playable/"
        )
      ]
    },
    {
      route: "/evidence/",
      label: "Evidence route",
      description:
        "Confirms the diagnostic route can substantiate implementation and readiness claims.",
      checks: [
        ready(
          "evidence-metadata",
          "Evidence metadata frames diagnostics and proof points",
          "seo",
          "Title and descriptions emphasize scene diagnostics, proof, performance notes, and implementation evidence.",
          "/evidence/"
        ),
        verify(
          "evidence-currentness",
          "Evidence content reflects the current build",
          "evidence",
          "Before release, confirm screenshots, diagnostics, and readiness claims correspond to the deployed Aura Clash build.",
          "/evidence/"
        )
      ]
    },
    {
      route: "/accessibility/",
      label: "Accessibility route",
      description:
        "Confirms inclusive interaction and readability notes are represented in launch data.",
      checks: [
        ready(
          "accessibility-metadata",
          "Accessibility metadata covers inclusive 3D interaction",
          "accessibility",
          "Title and descriptions call out keyboard paths, reduced-motion expectations, readable overlays, contrast, and interaction guidance.",
          "/accessibility/"
        ),
        verify(
          "accessibility-claims",
          "Accessibility notes match implemented behavior",
          "accessibility",
          "Before release, confirm the route claims are still accurate for keyboard access, motion settings, contrast, and overlay readability.",
          "/accessibility/"
        )
      ]
    },
    {
      route: "/deploy-check/",
      label: "Deploy-check route",
      description:
        "Confirms route-level launch checks are represented for production handoff.",
      checks: [
        ready(
          "deploy-check-metadata",
          "Deploy-check metadata describes release readiness",
          "deploy",
          "Title and descriptions focus on metadata, canonical routes, diagnostics, assets, accessibility, and deployment gates.",
          "/deploy-check/"
        ),
        verify(
          "deploy-check-final-review",
          "Deploy checklist is reviewed immediately before release",
          "deploy",
          "Use this route as the final human-readable handoff for route coverage, launch confidence, and unresolved verification items.",
          "/deploy-check/"
        )
      ]
    },
    {
      route: "/poster/",
      label: "Poster route",
      description:
        "Confirms the poster route is represented for sharing and social preview flows.",
      checks: [
        ready(
          "poster-metadata",
          "Poster metadata describes shareable showcase art",
          "poster",
          "Title and descriptions present the poster route as social-preview and launch-recap material for Aura Clash.",
          "/poster/"
        ),
        verify(
          "poster-preview-asset",
          "Poster visuals match the current social-preview story",
          "poster",
          "Before release, confirm poster art and any preview image remain aligned with the current Aura Clash build.",
          "/poster/"
        )
      ]
    }
  ]
};

export const auraClashDeployReadinessItems = [
  ...auraClashDeployReadinessChecklist.globalChecks,
  ...auraClashDeployReadinessChecklist.routeChecks.flatMap(
    (routeCheck) => routeCheck.checks
  )
] as const;

export const auraClashDeployReadinessByRoute = Object.fromEntries(
  auraClashDeployReadinessChecklist.routeChecks.map((routeCheck) => [
    routeCheck.route,
    routeCheck
  ])
) as Readonly<Record<AuraClashRoute, AuraClashRouteReadiness>>;
