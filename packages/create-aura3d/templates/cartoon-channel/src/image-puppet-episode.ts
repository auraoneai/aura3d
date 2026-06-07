import { episode, episodeSampleDescription } from "./episode";
import type { CartoonRouteSampleForVisual } from "./sample-episode-visual";
import "./image-puppet-episode.css";

export interface ImagePuppetEpisodeOptions {
  readonly sampleAt: (time: number) => CartoonRouteSampleForVisual;
  readonly duration: number;
  readonly fixedTime?: number;
}

export interface ImagePuppetEpisodeProof {
  readonly contractId: string;
  readonly episodeId: string;
  readonly title: string;
  readonly route: string;
  readonly mode: "image-derived-puppet-cutouts";
  readonly sourceImage: string;
  readonly sourcePixelsAnimated: true;
  readonly notTrue3D: true;
  readonly screenshotTarget: "#image-puppet-episode";
  readonly sample: CartoonRouteSampleForVisual;
  readonly movingCutouts: readonly string[];
  readonly limitations: readonly string[];
}

const sourceImage = "/aura-assets/moon-garden-feature-frame.png";
const movingCutouts = [
  "blue robot source-pixel head/body cutout",
  "blue robot source-pixel broom area",
  "yellow robot source-pixel head/body cutout",
  "yellow robot source-pixel arm/tool area",
  "wheelbarrow source-pixel cutout",
  "foreground flower source-pixel layer",
  "moon source-pixel pulse layer"
] as const;

export function installImagePuppetEpisode(options: ImagePuppetEpisodeOptions) {
  document.body.dataset.cartoonView = "image-puppet";
  const root = document.createElement("section");
  root.id = "image-puppet-episode";
  root.className = "image-puppet";
  root.setAttribute("aria-label", "Image-derived puppet animation using cutouts from the moon garden source PNG");
  root.innerHTML = `
    <div class="image-puppet__frame">
      <div class="image-puppet__base" aria-hidden="true"></div>
      <div class="image-puppet__matte image-puppet__matte--blue" aria-hidden="true"></div>
      <div class="image-puppet__matte image-puppet__matte--yellow" aria-hidden="true"></div>
      <div class="image-puppet__matte image-puppet__matte--cart" aria-hidden="true"></div>

      <div class="image-puppet__cutout image-puppet__cutout--moon" data-source-cutout="moon" aria-hidden="true"></div>
      <div class="image-puppet__cutout image-puppet__cutout--blue-body" data-source-cutout="blue-body" aria-hidden="true"></div>
      <div class="image-puppet__cutout image-puppet__cutout--blue-head" data-source-cutout="blue-head" aria-hidden="true"></div>
      <div class="image-puppet__cutout image-puppet__cutout--blue-broom" data-source-cutout="blue-broom" aria-hidden="true"></div>
      <div class="image-puppet__cutout image-puppet__cutout--cart" data-source-cutout="cart" aria-hidden="true"></div>
      <div class="image-puppet__cutout image-puppet__cutout--yellow-body" data-source-cutout="yellow-body" aria-hidden="true"></div>
      <div class="image-puppet__cutout image-puppet__cutout--yellow-head" data-source-cutout="yellow-head" aria-hidden="true"></div>
      <div class="image-puppet__cutout image-puppet__cutout--yellow-tool" data-source-cutout="yellow-tool" aria-hidden="true"></div>
      <div class="image-puppet__cutout image-puppet__cutout--foreground" data-source-cutout="foreground" aria-hidden="true"></div>

      <div class="image-puppet__hud">
        <span>Image-derived cutouts</span>
        <strong data-image-puppet-shot-label>Shot 1 / 3</strong>
      </div>
      <div class="image-puppet__caption" data-image-puppet-caption></div>
      <div class="image-puppet__timeline" aria-hidden="true">
        <span class="image-puppet__timeline-fill" data-image-puppet-progress></span>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const caption = root.querySelector<HTMLElement>("[data-image-puppet-caption]");
  const shotLabel = root.querySelector<HTMLElement>("[data-image-puppet-shot-label]");
  const progress = root.querySelector<HTMLElement>("[data-image-puppet-progress]");
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
    root.dataset.sourceImage = sourceImage;

    if (caption) {
      caption.textContent = sample.captionText ?? "The source image is duplicated into moving cutout layers.";
    }
    if (shotLabel) {
      shotLabel.textContent = `Shot ${shotIndex + 1} / ${episode.shotTimeline.shots.length}`;
    }
    if (progress) {
      progress.style.setProperty("--progress", `${progressPercent}%`);
    }

    window.__AURA3D_CARTOON_IMAGE_PUPPET_PROOF__ = {
      contractId: episodeSampleDescription.contractId,
      episodeId: episode.episodePlan.episodeId,
      title: episode.episodePlan.title,
      route: "/?view=image-puppet",
      mode: "image-derived-puppet-cutouts",
      sourceImage,
      sourcePixelsAnimated: true,
      notTrue3D: true,
      screenshotTarget: "#image-puppet-episode",
      sample,
      movingCutouts,
      limitations: [
        "The PNG is flattened, so these are approximate masked source-pixel cutouts, not clean production layers.",
        "The original still remains visible under the moving cutouts unless a real background plate or inpainted clean plate exists.",
        "This is image-derived 2D animation, not 3D reconstruction or rigged GLB character animation."
      ]
    };
  }

  render(Number.isFinite(fixedTime) ? Number(fixedTime) : 0);
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
    __AURA3D_CARTOON_IMAGE_PUPPET_PROOF__?: ImagePuppetEpisodeProof;
  }
}

function clampTime(time: number, duration: number) {
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(duration - 1 / 30, time));
}
