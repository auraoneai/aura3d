import { episode, episodeSampleDescription, youtubeDraftMetadata } from "./episode";

export interface CartoonRouteSampleForVisual {
  readonly time: number;
  readonly frame: number;
  readonly shotId?: string;
  readonly captionId?: string;
  readonly captionText?: string;
  readonly dialogueLineId?: string;
  readonly visemeId?: string;
  readonly nodeUpdates?: readonly {
    readonly characterId?: string;
    readonly action?: string;
    readonly emotion?: string;
  }[];
}

export interface SampleEpisodeVisualOptions {
  readonly sampleAt: (time: number) => CartoonRouteSampleForVisual;
  readonly duration: number;
  readonly fixedTime?: number;
  readonly usesTypedAssets?: boolean;
}

export function installSampleEpisodeVisual(options: SampleEpisodeVisualOptions) {
  const root = document.createElement("section");
  root.id = "sample-episode-visual";
  root.className = "sample-episode";
  root.setAttribute("aria-label", "Aura3D cartoon sample episode preview");
  root.innerHTML = `
    <div class="sample-episode__frame">
      <div class="sample-episode__aura-host-slot" data-aura-host-slot></div>
      <div class="sample-episode__moon" aria-hidden="true"></div>
      <div class="sample-episode__skyline" aria-hidden="true"></div>
      <div class="sample-episode__garden" aria-hidden="true"></div>
      <div class="sample-episode__path" aria-hidden="true"></div>
      <div class="sample-episode__stones" aria-hidden="true"></div>
      <div class="sample-episode__flowers" aria-hidden="true"></div>
      ${robotMarkup("miko", "Miko")}
      ${robotMarkup("luma", "Luma")}
      <div class="cartoon-broom" aria-hidden="true"></div>
      <h1 class="sample-episode__title">${escapeHtml(episode.episodePlan.title)}</h1>
      <div class="sample-episode__shot" data-sample-shot-label>Shot 1 / 3</div>
      <div class="sample-episode__proof">Aura3D cartoon contract · captions · visemes · render queue</div>
      <div class="sample-episode__caption" data-sample-caption></div>
      <div class="sample-episode__timeline" aria-hidden="true">
        <span class="sample-episode__timeline-fill" data-sample-progress></span>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const frame = root.querySelector<HTMLElement>(".sample-episode__frame");
  const hostSlot = root.querySelector<HTMLElement>("[data-aura-host-slot]");
  const appHost = document.querySelector<HTMLElement>("#app");
  if (frame && hostSlot && appHost) {
    hostSlot.replaceWith(appHost);
  }

  const caption = root.querySelector<HTMLElement>("[data-sample-caption]");
  const shotLabel = root.querySelector<HTMLElement>("[data-sample-shot-label]");
  const progress = root.querySelector<HTMLElement>("[data-sample-progress]");
  const queryTime = new URLSearchParams(window.location.search).get("sampleTime");
  const fixedTime = options.fixedTime ?? (queryTime ? Number(queryTime) : undefined);
  const start = performance.now();

  function render(time: number) {
    const sample = options.sampleAt(clampTime(time, options.duration));
    const shotIndex = Math.max(0, episode.shotTimeline.shots.findIndex((shot) => shot.shotId === sample.shotId));
    const speaker = sample.nodeUpdates?.find((update) => update.action === "speak")?.characterId ?? "";
    const progressPercent = Math.max(0, Math.min(100, (sample.time / options.duration) * 100));

    root.dataset.shotId = sample.shotId ?? "";
    root.dataset.captionId = sample.captionId ?? "";
    root.dataset.speaker = speaker;
    root.dataset.visemeId = sample.visemeId ?? "";
    root.dataset.usesTypedAssets = options.usesTypedAssets ? "true" : "false";
    root.dataset.cartoonSampleEpisode = "moon-garden-cleanup";
    root.dataset.youtubeDraftTitle = youtubeDraftMetadata.title;

    if (caption) {
      caption.textContent = sample.captionText ?? "Two tiny robots clean a glowing moon garden.";
    }
    if (shotLabel) {
      shotLabel.textContent = `Shot ${shotIndex + 1} / ${episode.shotTimeline.shots.length}`;
    }
    if (progress) {
      progress.style.setProperty("--progress", `${progressPercent}%`);
    }

    window.__AURA3D_CARTOON_SAMPLE_EPISODE__ = {
      contractId: episodeSampleDescription.contractId,
      episodeId: episode.episodePlan.episodeId,
      title: episode.episodePlan.title,
      route: "/",
      sample,
      visualLayer: {
        id: root.id,
        deterministicSampleTime: fixedTime ?? null,
        screenshotTarget: "#sample-episode-visual",
        renderedBy: "aura3d-scene",
        usesTypedAssets: Boolean(options.usesTypedAssets),
        characters: episode.episodePlan.characters.map((character) => character.id),
        styleGuide: episode.storyBible.styleGuide.visualStyle,
        youtubeDraftTitle: youtubeDraftMetadata.title
      }
    };
  }

  if (Number.isFinite(fixedTime)) {
    render(Number(fixedTime));
    return root;
  }

  const tick = () => {
    render(((performance.now() - start) / 1000) % options.duration);
    requestAnimationFrame(tick);
  };
  tick();
  return root;
}

declare global {
  interface Window {
    __AURA3D_CARTOON_SAMPLE_EPISODE__?: {
      readonly contractId: string;
      readonly episodeId: string;
      readonly title: string;
      readonly route: string;
      readonly sample: CartoonRouteSampleForVisual;
      readonly visualLayer: {
        readonly id: string;
        readonly deterministicSampleTime: number | null;
        readonly screenshotTarget: string;
        readonly renderedBy: "aura3d-scene";
        readonly usesTypedAssets: boolean;
        readonly characters: readonly string[];
        readonly styleGuide: string;
        readonly youtubeDraftTitle: string;
      };
    };
  }
}

function robotMarkup(id: "miko" | "luma", label: string) {
  return `
    <div class="cartoon-robot cartoon-robot--${id}" role="img" aria-label="${label} cartoon robot">
      <span class="cartoon-robot__antenna"></span>
      <span class="cartoon-robot__head">
        <span class="cartoon-robot__eye cartoon-robot__eye--left"></span>
        <span class="cartoon-robot__eye cartoon-robot__eye--right"></span>
        <span class="cartoon-robot__mouth"></span>
      </span>
      <span class="cartoon-robot__body"></span>
      <span class="cartoon-robot__arm cartoon-robot__arm--left"></span>
      <span class="cartoon-robot__arm cartoon-robot__arm--right"></span>
      <span class="cartoon-robot__leg cartoon-robot__leg--left"></span>
      <span class="cartoon-robot__leg cartoon-robot__leg--right"></span>
    </div>
  `;
}

function clampTime(time: number, duration: number) {
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(duration - 1 / 30, time));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}
