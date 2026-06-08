import { episode, episodeSampleDescription, youtubeDraftMetadata } from "../episode";
import type { AnimationRouteSampleForVisual } from "../sample-episode-visual";
import "./concept-episode-2-5d.css";

export interface ConceptEpisode2_5DOptions {
  readonly sampleAt: (time: number) => AnimationRouteSampleForVisual;
  readonly duration: number;
  readonly fixedTime?: number;
}

export interface ConceptEpisode2_5DProof {
  readonly contractId: string;
  readonly episodeId: string;
  readonly title: string;
  readonly route: string;
  readonly mode: "2.5d-parallax-concept";
  readonly sourceImage: string;
  readonly notTrue3D: true;
  readonly screenshotTarget: "#concept-episode-2-5d";
  readonly sample: AnimationRouteSampleForVisual;
  readonly parallax: number;
  readonly layers: readonly {
    readonly id: string;
    readonly role: string;
    readonly depth: number;
    readonly source: "same-concept-frame";
  }[];
  readonly aura3dRole: readonly string[];
  readonly limitations: readonly string[];
}

const sourceImage = "/aura-assets/moon-garden-feature-frame.png";
const layers = [
  { id: "far-background", role: "moonlit sky and set backdrop", depth: 0.12, source: "same-concept-frame" },
  { id: "midground-set", role: "garden stage and central character space", depth: 0.42, source: "same-concept-frame" },
  { id: "character-plane", role: "painted character/action plane", depth: 0.72, source: "same-concept-frame" },
  { id: "foreground-garden", role: "front flowers/path edge", depth: 1, source: "same-concept-frame" }
] as const;

export function installConceptEpisode2_5D(options: ConceptEpisode2_5DOptions) {
  document.body.dataset.animationView = "concept-2-5d";
  const root = document.createElement("section");
  root.id = "concept-episode-2-5d";
  root.className = "concept-2-5d";
  root.setAttribute("aria-label", "Aura3D 2.5D animation concept episode preview");
  root.innerHTML = `
    <div class="concept-2-5d__frame">
      <div class="concept-2-5d__layer concept-2-5d__layer--far" data-layer-id="far-background" aria-hidden="true"></div>
      <div class="concept-2-5d__layer concept-2-5d__layer--mid" data-layer-id="midground-set" aria-hidden="true"></div>
      <div class="concept-2-5d__layer concept-2-5d__layer--characters" data-layer-id="character-plane" aria-hidden="true"></div>
      <div class="concept-2-5d__layer concept-2-5d__layer--foreground" data-layer-id="foreground-garden" aria-hidden="true"></div>
      <div class="concept-2-5d__aura-host-slot" data-aura-host-slot></div>
      <div class="concept-2-5d__grain" aria-hidden="true"></div>
      <div class="concept-2-5d__hud">
        <span>2.5D concept frame</span>
        <strong data-concept-shot-label>Shot 1 / 3</strong>
      </div>
      <div class="concept-2-5d__caption" data-concept-caption></div>
      <div class="concept-2-5d__timeline" aria-hidden="true">
        <span class="concept-2-5d__timeline-fill" data-concept-progress></span>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const hostSlot = root.querySelector<HTMLElement>("[data-aura-host-slot]");
  const appHost = document.querySelector<HTMLElement>("#app");
  if (hostSlot && appHost) {
    hostSlot.replaceWith(appHost);
  }

  const caption = root.querySelector<HTMLElement>("[data-concept-caption]");
  const shotLabel = root.querySelector<HTMLElement>("[data-concept-shot-label]");
  const progress = root.querySelector<HTMLElement>("[data-concept-progress]");
  const query = new URLSearchParams(window.location.search);
  const queryTime = query.get("sampleTime");
  const queryParallax = query.get("parallax");
  const animateParallax = query.get("animateParallax") === "1";
  const fixedTime = options.fixedTime ?? (queryTime ? Number(queryTime) : undefined);
  const fixedParallax = queryParallax ? Number(queryParallax) : undefined;
  const start = performance.now();

  function render(time: number, parallax: number) {
    const clampedParallax = Math.max(-1, Math.min(1, Number.isFinite(parallax) ? parallax : 0));
    const sample = options.sampleAt(clampTime(time, options.duration));
    const shotIndex = Math.max(0, episode.shotTimeline.shots.findIndex((shot) => shot.shotId === sample.shotId));
    const progressPercent = Math.max(0, Math.min(100, (sample.time / options.duration) * 100));

    root.dataset.shotId = sample.shotId ?? "";
    root.dataset.captionId = sample.captionId ?? "";
    root.dataset.conceptEpisode = "moon-garden-cleanup";
    root.style.setProperty("--parallax", String(clampedParallax));

    if (caption) {
      caption.textContent = sample.captionText ?? "The image is treated as layered source art, not a true 3D mesh.";
    }
    if (shotLabel) {
      shotLabel.textContent = `Shot ${shotIndex + 1} / ${episode.shotTimeline.shots.length}`;
    }
    if (progress) {
      progress.style.setProperty("--progress", `${progressPercent}%`);
    }

    window.__AURA3D_ANIMATION_2_5D_PROOF__ = {
      contractId: episodeSampleDescription.contractId,
      episodeId: episode.episodePlan.episodeId,
      title: episode.episodePlan.title,
      route: "/?view=concept-2-5d",
      mode: "2.5d-parallax-concept",
      sourceImage,
      notTrue3D: true,
      screenshotTarget: "#concept-episode-2-5d",
      sample,
      parallax: clampedParallax,
      layers,
      aura3dRole: [
        "episode contract and shot timing",
        "caption timing",
        "camera/parallax plan",
        "proof metadata",
        "optional foreground Aura3D scene graph"
      ],
      limitations: [
        "This is not mesh reconstruction from a still image.",
        "The camera can pan, push, and create depth parallax, but it cannot orbit behind the painted characters.",
        "Production-quality 2.5D needs actual masks/depth maps or separated PSD-style layers."
      ]
    };
  }

  if (Number.isFinite(fixedTime) && !animateParallax) {
    render(Number(fixedTime), Number.isFinite(fixedParallax) ? Number(fixedParallax) : 0);
    return root;
  }

  const tick = () => {
    const elapsed = (performance.now() - start) / 1000;
    const sampleTime = Number.isFinite(fixedTime) ? Number(fixedTime) : elapsed % options.duration;
    render(sampleTime, Math.sin(elapsed * 0.82));
    requestAnimationFrame(tick);
  };
  tick();
  return root;
}

declare global {
  interface Window {
    __AURA3D_ANIMATION_2_5D_PROOF__?: ConceptEpisode2_5DProof;
  }
}

function clampTime(time: number, duration: number) {
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(duration - 1 / 30, time));
}
