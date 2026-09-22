import { auraClashHref } from "../routeLinks";

export interface TitleScreenCta {
  label: string;
  href: string;
  intent: "primary" | "secondary" | "proof";
}

export interface TitleScreenModel {
  eyebrow: string;
  title: string;
  subtitle: string;
  proofLine: string;
  ctas: TitleScreenCta[];
}

export const auraClashTitleScreen: TitleScreenModel = {
  eyebrow: "Aura3D development showcase",
  title: "Aura Clash",
  subtitle:
    "A browser fighting-game demo built with typed GLB assets, arenas, responsive combat UI, accessibility controls, and deploy-ready TypeScript.",
  proofLine: "Quaternius CC0 fighters + Downtown City MegaKit arena + Aura3D typed asset workflow.",
  ctas: [
    {
      label: "Play the route",
      href: auraClashHref("playable"),
      intent: "primary",
    },
    {
      label: "View evidence",
      href: auraClashHref("evidence"),
      intent: "proof",
    },
    {
      label: "Capture poster",
      href: auraClashHref("poster"),
      intent: "secondary",
    },
  ],
};
