import {
  auraClashAcceptanceGates,
  auraClashAnimationStates,
  auraClashAssetEvidence,
  auraClashControlEvidence,
  auraClashEvidence,
  auraClashRuntimeMutationEvidenceContract,
  auraClashRouteEvidence,
} from "./evidence/evidenceModel";
import { auraClashPosterScenarios, getAuraClashPosterScenario } from "./capture/PosterScenarios";

const statusLabel = {
  complete: "complete",
  implemented: "implemented",
  "needs-visual-qa": "needs visual QA",
  pending: "pending",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function list(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function evidenceCards(): string {
  return auraClashEvidence
    .map(
      (item) => `
        <article class="ac-proof-card ac-proof-card--${item.status}">
          <span>${escapeHtml(statusLabel[item.status])}</span>
          <h3>${escapeHtml(item.label)}</h3>
          <p>${escapeHtml(item.proof)}</p>
          ${list(item.files)}
        </article>
      `,
    )
    .join("");
}

function assetRows(): string {
  return auraClashAssetEvidence
    .map(
      (asset) => `
        <tr>
          <td>${escapeHtml(asset.name)}</td>
          <td><code>${escapeHtml(asset.typedAsset)}</code></td>
          <td>${escapeHtml(asset.role)}</td>
          <td><code>${escapeHtml(asset.sourcePath)}</code></td>
        </tr>
      `,
    )
    .join("");
}

function runtimeMutationContractCard(): string {
  return `
    <article class="ac-proof-card ac-proof-card--implemented">
      <span>implemented</span>
      <h3>Runtime mutation JSON contract</h3>
      <p>${escapeHtml(auraClashRuntimeMutationEvidenceContract.runtimeExport)}</p>
      ${list([...auraClashRuntimeMutationEvidenceContract.requiredSignals])}
      ${list([...auraClashRuntimeMutationEvidenceContract.sourceFiles])}
    </article>
  `;
}

function routeCards(): string {
  return auraClashRouteEvidence
    .map(
      (route) => `
        <article class="ac-route-evidence-card">
          <strong>${escapeHtml(route.path)}</strong>
          <p>${escapeHtml(route.purpose)}</p>
          ${list(route.requiredSignals)}
        </article>
      `,
    )
    .join("");
}

function controlRows(): string {
  return auraClashControlEvidence
    .map(
      (control) => `
        <tr>
          <td><kbd>${escapeHtml(control.key)}</kbd></td>
          <td>${escapeHtml(control.action)}</td>
          <td>${escapeHtml(control.gameplayEffect)}</td>
          <td>${escapeHtml(control.accessibilityNote)}</td>
        </tr>
      `,
    )
    .join("");
}

function gateCards(): string {
  return auraClashAcceptanceGates
    .map(
      (gate) => `
        <article class="ac-proof-card ac-proof-card--${gate.status}">
          <span>${escapeHtml(statusLabel[gate.status])}</span>
          <h3>${escapeHtml(gate.label)}</h3>
          <p>${escapeHtml(gate.proof)}</p>
          ${list(gate.files)}
        </article>
      `,
    )
    .join("");
}

function posterCards(): string {
  return auraClashPosterScenarios
    .map(
      (scenario) => `
        <article class="ac-poster-scenario-card">
          <span>${escapeHtml(scenario.outputFile)}</span>
          <h3>${escapeHtml(scenario.title)}</h3>
          <p>${escapeHtml(scenario.composition)}</p>
          ${list(scenario.requiredElements)}
        </article>
      `,
    )
    .join("");
}

function renderEvidenceConsole(): string {
  return `
    <section class="ac-proof-console" aria-labelledby="aura-clash-proof-title">
      <div class="ac-proof-console__header">
        <span>Developer evidence</span>
        <h2 id="aura-clash-proof-title">Aura Clash implementation proof</h2>
        <p>
          This route exposes the exact typed assets, provenance records, gameplay systems, route surface, accessibility controls,
          and incomplete visual QA gates behind the showcase.
        </p>
      </div>

      <div class="ac-proof-card-grid">
        ${evidenceCards()}
        ${runtimeMutationContractCard()}
      </div>

      <div class="ac-proof-table-wrap">
        <div>
          <span>Typed GLB registry</span>
          <h3>Registered Aura3D assets</h3>
        </div>
        <table class="ac-proof-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Typed reference</th>
              <th>Role</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>${assetRows()}</tbody>
        </table>
      </div>

      <div class="ac-route-evidence-grid">
        ${routeCards()}
      </div>

      <div class="ac-proof-table-wrap">
        <div>
          <span>Playable input map</span>
          <h3>Controls and accessibility notes</h3>
        </div>
        <table class="ac-proof-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Action</th>
              <th>Gameplay effect</th>
              <th>Accessibility note</th>
            </tr>
          </thead>
          <tbody>${controlRows()}</tbody>
        </table>
      </div>

      <div class="ac-animation-proof">
        <span>Animation state contract</span>
        <div>${auraClashAnimationStates.map((state) => `<code>${escapeHtml(state)}</code>`).join("")}</div>
      </div>

      <div class="ac-proof-card-grid">
        ${gateCards()}
      </div>
    </section>
  `;
}

function renderPosterConsole(): string {
  const scenario = getAuraClashPosterScenario(new URLSearchParams(window.location.search).get("scenario"));

  return `
    <section class="ac-proof-console ac-poster-console" aria-labelledby="aura-clash-poster-title">
      <div class="ac-proof-console__header">
        <span>Capture plan</span>
        <h2 id="aura-clash-poster-title">${escapeHtml(scenario.title)}</h2>
        <p>${escapeHtml(scenario.composition)}</p>
      </div>

      <div class="ac-poster-selected">
        <strong>${escapeHtml(scenario.outputFile)}</strong>
        <p>${escapeHtml(scenario.route)}</p>
        ${list(scenario.qaNotes)}
      </div>

      <div class="ac-poster-scenario-grid">
        ${posterCards()}
      </div>
    </section>
  `;
}

function mountProofConsole(): void {
  const route = window.location.pathname;
  const shouldShowEvidence = route.includes("/evidence") || route.includes("/deploy-check") || route.includes("/accessibility");
  const shouldShowPoster = route.includes("/poster");

  if (!shouldShowEvidence && !shouldShowPoster) {
    return;
  }

  const shell = document.querySelector<HTMLElement>(".ac-shell") ?? document.body;
  if (!shell || shell.querySelector("[data-aura-clash-proof-console]")) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.dataset.auraClashProofConsole = "true";
  wrapper.innerHTML = shouldShowPoster ? renderPosterConsole() : renderEvidenceConsole();
  shell.appendChild(wrapper);
}

function scheduleProofConsole(): void {
  requestAnimationFrame(() => {
    mountProofConsole();
    window.setTimeout(mountProofConsole, 200);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleProofConsole, { once: true });
} else {
  scheduleProofConsole();
}
