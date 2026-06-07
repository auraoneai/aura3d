export const AURA_CLASH_ROUTES = [
  "/playable/",
  "/evidence/",
  "/accessibility/",
  "/deploy-check/",
  "/poster/"
] as const;

export const AURA_CLASH_ROUTE_METADATA_ROUTES = [
  "/",
  ...AURA_CLASH_ROUTES
] as const;

export type AuraClashRoute = (typeof AURA_CLASH_ROUTES)[number];
export type AuraClashMetadataRoute =
  (typeof AURA_CLASH_ROUTE_METADATA_ROUTES)[number];

export type AuraClashSitemapChangeFrequency = "weekly" | "monthly";

export type AuraClashSocialMetadata = {
  readonly title: string;
  readonly description: string;
  readonly imageAlt: string;
  readonly card: "summary_large_image";
};

export type AuraClashOpenGraphMetadata = {
  readonly siteName: string;
  readonly type: "website";
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly image: string;
  readonly imageAlt: string;
};

export type AuraClashTwitterMetadata = {
  readonly card: "summary_large_image";
  readonly title: string;
  readonly description: string;
  readonly image: string;
  readonly imageAlt: string;
};

export type AuraClashSitemapMetadata = {
  readonly loc: string;
  readonly changefreq: AuraClashSitemapChangeFrequency;
  readonly priority: number;
};

export type AuraClashRobotsMetadata = {
  readonly allow: true;
  readonly path: string;
  readonly sitemap: string;
};

export type AuraClashRouteMetadata = {
  readonly route: AuraClashMetadataRoute;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly canonicalPath: AuraClashMetadataRoute;
  readonly canonicalUrl: string;
  readonly openGraph: AuraClashOpenGraphMetadata;
  readonly twitter: AuraClashTwitterMetadata;
  readonly sitemap: AuraClashSitemapMetadata;
  readonly robots: AuraClashRobotsMetadata;
  readonly social: AuraClashSocialMetadata;
};

export type AuraClashRouteMetadataCheck = {
  readonly id: string;
  readonly passed: boolean;
  readonly message: string;
};

export type CanonicalUrlOptions = {
  readonly origin?: string;
};

type AuraClashRouteMetadataSource = {
  readonly route: AuraClashMetadataRoute;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly socialTitle: string;
  readonly socialDescription: string;
  readonly socialImageAlt: string;
  readonly sitemapChangefreq: AuraClashSitemapChangeFrequency;
  readonly sitemapPriority: number;
};

export const AURA_CLASH_CANONICAL_ORIGIN = "https://aura3d.auraone.ai";
export const AURA_CLASH_CANONICAL_BASE_PATH = "/showcase/aura-clash";
export const AURA_CLASH_SITE_NAME = "Aura Clash";
export const AURA_CLASH_SOCIAL_IMAGE_PATH = "/aura-assets/auraClashPlayableScene.thumb.svg";
export const AURA_CLASH_SITEMAP_PATH = `${AURA_CLASH_CANONICAL_BASE_PATH}/sitemap.xml`;

const normalizeOrigin = (origin: string): string => origin.replace(/\/+$/, "");

const buildCanonicalPath = (route: AuraClashMetadataRoute): string =>
  `${AURA_CLASH_CANONICAL_BASE_PATH}${route}`;

const buildAbsoluteUrl = (
  path: string,
  options: CanonicalUrlOptions = {}
): string => `${normalizeOrigin(options.origin ?? AURA_CLASH_CANONICAL_ORIGIN)}${path}`;

const buildCanonicalUrl = (
  canonicalPath: AuraClashMetadataRoute,
  options: CanonicalUrlOptions = {}
): string => buildAbsoluteUrl(buildCanonicalPath(canonicalPath), options);

const buildSitemapUrl = (options: CanonicalUrlOptions = {}): string =>
  buildAbsoluteUrl(AURA_CLASH_SITEMAP_PATH, options);

const routeMetadataSource: readonly AuraClashRouteMetadataSource[] = [
  {
    route: "/",
    slug: "showcase",
    title: "Aura Clash | Aura3D Browser Fighting Game Showcase",
    description:
      "Open the Aura Clash showcase hub for the playable browser fighting game, evidence route, accessibility notes, deploy-check source, and poster route.",
    socialTitle: "Aura Clash browser fighting game showcase",
    socialDescription:
      "Explore Aura Clash, an Aura3D scoped game-runtime showcase with typed GLB fighters, playable combat, evidence routes, and source-backed launch surfaces.",
    socialImageAlt:
      "Aura Clash showcase hub for a browser-based 3D fighting game built with Aura3D",
    sitemapChangefreq: "weekly",
    sitemapPriority: 0.9
  },
  {
    route: "/playable/",
    slug: "playable",
    title: "Aura Clash Playable | Real-Time 3D Browser Demo",
    description:
      "Play the Aura Clash browser demo and inspect the real-time 3D combat loop, arena pacing, responsive controls, and Aura3D scene behavior.",
    socialTitle: "Play Aura Clash in the browser",
    socialDescription:
      "Jump into Aura Clash's playable Aura3D showcase with fast arena action, visible controls, and a proof-backed 3D interaction loop.",
    socialImageAlt:
      "Aura Clash playable route showing a browser-based 3D arena combat demo",
    sitemapChangefreq: "weekly",
    sitemapPriority: 1
  },
  {
    route: "/evidence/",
    slug: "evidence",
    title: "Aura Clash Evidence | Scene Diagnostics and Proof",
    description:
      "Review the Aura Clash evidence route for scene diagnostics, rendered proof points, performance notes, and implementation details behind the showcase.",
    socialTitle: "Aura Clash evidence and diagnostics",
    socialDescription:
      "See the proof behind Aura Clash, including route evidence, scene diagnostics, performance cues, and Aura3D readiness signals.",
    socialImageAlt:
      "Aura Clash evidence route with diagnostics and implementation proof points",
    sitemapChangefreq: "weekly",
    sitemapPriority: 0.7
  },
  {
    route: "/accessibility/",
    slug: "accessibility",
    title: "Aura Clash Accessibility | Inclusive 3D Interaction Notes",
    description:
      "Check Aura Clash accessibility coverage for keyboard paths, reduced-motion expectations, readable overlays, contrast notes, and inclusive interaction guidance.",
    socialTitle: "Aura Clash accessibility coverage",
    socialDescription:
      "Review how Aura Clash documents accessible 3D interaction, readable UI layers, keyboard expectations, and reduced-motion readiness.",
    socialImageAlt:
      "Aura Clash accessibility route with inclusive interaction and readable overlay guidance",
    sitemapChangefreq: "monthly",
    sitemapPriority: 0.5
  },
  {
    route: "/deploy-check/",
    slug: "deploy-check",
    title: "Aura Clash Deploy Check | Release Readiness",
    description:
      "Use the Aura Clash deploy-check route to review source-level release readiness across metadata, canonical routes, diagnostics, assets, accessibility, and deployment gates.",
    socialTitle: "Aura Clash release readiness checklist",
    socialDescription:
      "Track Aura Clash deployment status with route-level readiness checks for metadata, diagnostics, assets, accessibility, and launch confidence.",
    socialImageAlt:
      "Aura Clash deploy-check route showing release readiness and route verification status",
    sitemapChangefreq: "weekly",
    sitemapPriority: 0.4
  },
  {
    route: "/poster/",
    slug: "poster",
    title: "Aura Clash Poster | Shareable 3D Showcase Art",
    description:
      "View the Aura Clash poster route for shareable showcase art, social preview context, and a concise visual summary of the 3D browser experience.",
    socialTitle: "Aura Clash showcase poster",
    socialDescription:
      "Share Aura Clash with a poster-ready visual route built for social previews, launch recaps, and compact showcase context.",
    socialImageAlt:
      "Aura Clash poster route with shareable 3D showcase artwork and social preview framing",
    sitemapChangefreq: "weekly",
    sitemapPriority: 0.6
  }
];

export const createAuraClashRouteMetadata = (
  options: CanonicalUrlOptions = {}
): readonly AuraClashRouteMetadata[] =>
  routeMetadataSource.map((metadata) => {
    const canonicalUrl = buildCanonicalUrl(metadata.route, options);
    const socialImage = buildAbsoluteUrl(AURA_CLASH_SOCIAL_IMAGE_PATH, options);

    return {
      route: metadata.route,
      slug: metadata.slug,
      title: metadata.title,
      description: metadata.description,
      canonicalPath: metadata.route,
      canonicalUrl,
      openGraph: {
        siteName: AURA_CLASH_SITE_NAME,
        type: "website",
        title: metadata.socialTitle,
        description: metadata.socialDescription,
        url: canonicalUrl,
        image: socialImage,
        imageAlt: metadata.socialImageAlt
      },
      twitter: {
        card: "summary_large_image",
        title: metadata.socialTitle,
        description: metadata.socialDescription,
        image: socialImage,
        imageAlt: metadata.socialImageAlt
      },
      sitemap: {
        loc: canonicalUrl,
        changefreq: metadata.sitemapChangefreq,
        priority: metadata.sitemapPriority
      },
      robots: {
        allow: true,
        path: buildCanonicalPath(metadata.route),
        sitemap: buildSitemapUrl(options)
      },
      social: {
        title: metadata.socialTitle,
        description: metadata.socialDescription,
        imageAlt: metadata.socialImageAlt,
        card: "summary_large_image"
      }
    };
  });

export const auraClashRouteMetadata = createAuraClashRouteMetadata();

export const auraClashRouteMetadataByRoute = Object.fromEntries(
  auraClashRouteMetadata.map((metadata) => [metadata.route, metadata])
) as Readonly<Record<AuraClashMetadataRoute, AuraClashRouteMetadata>>;

const hasText = (value: string): boolean => value.trim().length > 0;

const hasRequiredRoutes = (
  metadata: readonly AuraClashRouteMetadata[],
  routes: readonly AuraClashMetadataRoute[]
): boolean => {
  const metadataRoutes = new Set(metadata.map((entry) => entry.route));
  return routes.every((route) => metadataRoutes.has(route));
};

const metadataText = (entry: AuraClashRouteMetadata): string =>
  [
    entry.title,
    entry.description,
    entry.openGraph.title,
    entry.openGraph.description,
    entry.openGraph.imageAlt,
    entry.twitter.title,
    entry.twitter.description,
    entry.twitter.imageAlt,
    entry.social.title,
    entry.social.description,
    entry.social.imageAlt
  ].join("\n");

const unsupportedMaturityClaimPatterns = [
  /\bmature\b/i,
  /\bflagship\b/i,
  /\bproduction[- ]ready\b/i,
  /\brelease[- ]ready\b/i,
  /\bcomplete game\b/i,
  /\bfinished game\b/i
] as const;

const hasUnsupportedMaturityClaim = (entry: AuraClashRouteMetadata): boolean =>
  unsupportedMaturityClaimPatterns.some((pattern) => pattern.test(metadataText(entry)));

export const checkAuraClashRouteMetadataSource = (
  metadata: readonly AuraClashRouteMetadata[] = auraClashRouteMetadata
): readonly AuraClashRouteMetadataCheck[] => [
  {
    id: "routes:public-surfaces",
    passed: hasRequiredRoutes(metadata, AURA_CLASH_ROUTE_METADATA_ROUTES),
    message:
      "Metadata source covers the showcase hub plus playable, evidence, accessibility, deploy-check, and poster routes."
  },
  {
    id: "metadata:canonical",
    passed: metadata.every(
      (entry) =>
        entry.canonicalPath === entry.route &&
        entry.canonicalUrl === buildCanonicalUrl(entry.route)
    ),
    message:
      "Every Aura Clash route has a canonical path and absolute canonical URL."
  },
  {
    id: "metadata:open-graph",
    passed: metadata.every(
      (entry) =>
        entry.openGraph.siteName === AURA_CLASH_SITE_NAME &&
        entry.openGraph.type === "website" &&
        entry.openGraph.url === entry.canonicalUrl &&
        hasText(entry.openGraph.title) &&
        hasText(entry.openGraph.description) &&
        hasText(entry.openGraph.image) &&
        hasText(entry.openGraph.imageAlt)
    ),
    message:
      "Every Aura Clash route has Open Graph title, description, image, image alt, type, site name, and URL metadata."
  },
  {
    id: "metadata:twitter",
    passed: metadata.every(
      (entry) =>
        entry.twitter.card === "summary_large_image" &&
        hasText(entry.twitter.title) &&
        hasText(entry.twitter.description) &&
        hasText(entry.twitter.image) &&
        hasText(entry.twitter.imageAlt)
    ),
    message:
      "Every Aura Clash route has Twitter summary-card title, description, image, and image alt metadata."
  },
  {
    id: "metadata:sitemap",
    passed: metadata.every(
      (entry) =>
        entry.sitemap.loc === entry.canonicalUrl &&
        entry.sitemap.priority > 0 &&
        entry.sitemap.priority <= 1 &&
        (entry.sitemap.changefreq === "weekly" ||
          entry.sitemap.changefreq === "monthly")
    ),
    message:
      "Every Aura Clash route has a sitemap location, change frequency, and valid priority."
  },
  {
    id: "metadata:robots",
    passed: metadata.every(
      (entry) =>
        entry.robots.allow === true &&
        entry.robots.path === buildCanonicalPath(entry.route) &&
        entry.robots.sitemap === buildSitemapUrl()
    ),
    message:
      "Every Aura Clash route has an allow-list robots path and sitemap reference."
  },
  {
    id: "claims:scoped-runtime",
    passed: metadata.every((entry) => !hasUnsupportedMaturityClaim(entry)),
    message:
      "Aura Clash route metadata stays scoped to current evidence and avoids mature, flagship, production-ready, release-ready, or complete-game claims."
  }
];

export const auraClashRouteMetadataSourceChecks =
  checkAuraClashRouteMetadataSource();

export const getAuraClashRouteMetadata = (
  route: AuraClashMetadataRoute,
  options?: CanonicalUrlOptions
): AuraClashRouteMetadata => {
  if (!options?.origin) {
    return auraClashRouteMetadataByRoute[route];
  }

  return createAuraClashRouteMetadata(options).find(
    (metadata) => metadata.route === route
  ) as AuraClashRouteMetadata;
};
