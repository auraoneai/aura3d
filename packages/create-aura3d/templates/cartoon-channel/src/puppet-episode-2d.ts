import { episode, episodeSampleDescription, youtubeDraftMetadata } from "./episode";
import type { CartoonRouteSampleForVisual } from "./sample-episode-visual";
import "./puppet-episode-2d.css";

export interface PuppetEpisode2DOptions {
  readonly sampleAt: (time: number) => CartoonRouteSampleForVisual;
  readonly duration: number;
  readonly fixedTime?: number;
}

export interface PuppetEpisode2DProof {
  readonly contractId: string;
  readonly episodeId: string;
  readonly title: string;
  readonly route: string;
  readonly mode: "2d-puppet-animation-over-concept-art";
  readonly sourceImage: string;
  readonly notTrue3D: true;
  readonly screenshotTarget: "#puppet-episode-2d";
  readonly sample: CartoonRouteSampleForVisual;
  readonly animatedParts: readonly string[];
  readonly aura3dRole: readonly string[];
  readonly limitations: readonly string[];
}

const sourceImage = "/aura-assets/moon-garden-feature-frame.png";
const animatedParts = [
  "blue robot head bob",
  "blue robot eyes blink",
  "blue robot broom sweep",
  "blue robot shoulder and elbow arcs",
  "yellow robot head nod",
  "yellow robot eyes blink",
  "yellow robot rake/push arm",
  "wheelbarrow body roll",
  "moon ring pulse",
  "foreground flower glow",
  "caption/timeline timing"
] as const;

export function installPuppetEpisode2D(options: PuppetEpisode2DOptions) {
  document.body.dataset.cartoonView = "puppet-2d";
  const root = document.createElement("section");
  root.id = "puppet-episode-2d";
  root.className = "puppet-episode";
  root.setAttribute("aria-label", "Aura3D 2D puppet cartoon animation over moon garden concept art");
  root.innerHTML = `
    <div class="puppet-episode__frame">
      <div class="puppet-episode__backdrop" aria-hidden="true"></div>
      <div class="puppet-episode__moon-pulse" aria-hidden="true"></div>
      <div class="puppet-episode__glow puppet-episode__glow--left" aria-hidden="true"></div>
      <div class="puppet-episode__glow puppet-episode__glow--right" aria-hidden="true"></div>

      <div class="puppet-robot puppet-robot--miko" aria-label="Miko sweeping animated puppet" role="img">
        <span class="puppet-robot__shadow"></span>
        <span class="puppet-robot__leg puppet-robot__leg--back"></span>
        <span class="puppet-robot__leg puppet-robot__leg--front"></span>
        <span class="puppet-robot__body"></span>
        <span class="puppet-robot__head">
          <span class="puppet-robot__eye puppet-robot__eye--left"></span>
          <span class="puppet-robot__eye puppet-robot__eye--right"></span>
          <span class="puppet-robot__smile"></span>
          <span class="puppet-robot__antenna"></span>
        </span>
        <span class="puppet-robot__arm puppet-robot__arm--back"></span>
        <span class="puppet-robot__arm puppet-robot__arm--front"></span>
        <span class="puppet-tool puppet-tool--broom"></span>
      </div>

      <div class="puppet-wheelbarrow" aria-hidden="true">
        <span class="puppet-wheelbarrow__bin"></span>
        <span class="puppet-wheelbarrow__wheel"></span>
        <span class="puppet-wheelbarrow__handles"></span>
      </div>

      <div class="puppet-robot puppet-robot--luma" aria-label="Luma pushing animated puppet" role="img">
        <span class="puppet-robot__shadow"></span>
        <span class="puppet-robot__leg puppet-robot__leg--back"></span>
        <span class="puppet-robot__leg puppet-robot__leg--front"></span>
        <span class="puppet-robot__body"></span>
        <span class="puppet-robot__head">
          <span class="puppet-robot__eye puppet-robot__eye--left"></span>
          <span class="puppet-robot__eye puppet-robot__eye--right"></span>
          <span class="puppet-robot__smile"></span>
          <span class="puppet-robot__antenna"></span>
        </span>
        <span class="puppet-robot__arm puppet-robot__arm--back"></span>
        <span class="puppet-robot__arm puppet-robot__arm--front"></span>
        <span class="puppet-tool puppet-tool--rake"></span>
      </div>

      <div class="puppet-episode__foreground" aria-hidden="true"></div>
      <div class="puppet-episode__hud">
        <span>2D puppet animation</span>
        <strong data-puppet-shot-label>Shot 1 / 3</strong>
      </div>
      <div class="puppet-episode__caption" data-puppet-caption></div>
      <div class="puppet-episode__timeline" aria-hidden="true">
        <span class="puppet-episode__timeline-fill" data-puppet-progress></span>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const hostSlot = document.querySelector<HTMLElement>("[data-aura-host-slot]");
  const appHost = document.querySelector<HTMLElement>("#app");
  if (hostSlot && appHost) {
    hostSlot.replaceWith(appHost);
  }

  const caption = root.querySelector<HTMLElement>("[data-puppet-caption]");
  const shotLabel = root.querySelector<HTMLElement>("[data-puppet-shot-label]");
  const progress = root.querySelector<HTMLElement>("[data-puppet-progress]");
  const query = new URLSearchParams(window.location.search);
  const queryTime = query.get("sampleTime");
  const fixedTime = options.fixedTime ?? (queryTime ? Number(queryTime) : undefined);
  const start = performance.now();

  function render(time: number) {
    const sample = options.sampleAt(clampTime(time, options.duration));
    const shotIndex = Math.max(0, episode.shotTimeline.shots.findIndex((shot) => shot.shotId === sample.shotId));
    const progressPercent = Math.max(0, Math.min(100, (sample.time / options.duration) * 100));

    root.dataset.shotId = sample.shotId ?? "";
    root.dataset.captionId = sample.captionId ?? "";
    root.dataset.puppetEpisode = "moon-garden-cleanup";

    if (caption) {
      caption.textContent = sample.captionText ?? "The robots sweep, blink, nod, and push the garden cart.";
    }
    if (shotLabel) {
      shotLabel.textContent = `Shot ${shotIndex + 1} / ${episode.shotTimeline.shots.length}`;
    }
    if (progress) {
      progress.style.setProperty("--progress", `${progressPercent}%`);
    }

    window.__AURA3D_CARTOON_2D_PUPPET_PROOF__ = {
      contractId: episodeSampleDescription.contractId,
      episodeId: episode.episodePlan.episodeId,
      title: episode.episodePlan.title,
      route: "/?view=puppet-2d",
      mode: "2d-puppet-animation-over-concept-art",
      sourceImage,
      notTrue3D: true,
      screenshotTarget: "#puppet-episode-2d",
      sample,
      animatedParts,
      aura3dRole: [
        "episode contract and shot timing",
        "caption timing",
        "animation state/proof metadata",
        "render/record evidence",
        "optional replacement with typed 3D foreground assets"
      ],
      limitations: [
        "This is 2D puppet animation over concept art, not a generated 3D scene.",
        "A production pass should replace CSS puppet shapes with separated art layers or rigged character assets.",
        "The source frame supplies the art direction/backdrop; the moving robots are explicit overlay puppets."
      ]
    };
  }

  if (Number.isFinite(fixedTime)) {
    render(Number(fixedTime));
  } else {
    render(0);
  }

  const tick = () => {
    if (!Number.isFinite(fixedTime)) {
      render(((performance.now() - start) / 1000) % options.duration);
    }
    requestAnimationFrame(tick);
  };
  tick();
  return root;
}

declare global {
  interface Window {
    __AURA3D_CARTOON_2D_PUPPET_PROOF__?: PuppetEpisode2DProof;
  }
}

function clampTime(time: number, duration: number) {
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(duration - 1 / 30, time));
}
