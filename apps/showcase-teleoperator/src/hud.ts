/**
 * Grid Dispatch HUD: fare card, active trip, ride summary, shift results, totals, toasts, popups and the minimap.
 * Cards are built once per state change and then only their numbers are updated (C10); the screen-reader status line is a
 * separate low-frequency element.
 */
import { careerRating, clamp, CURB_BEACON_X, FARES, SHIFT_FARES, SHIFT_SECONDS, type CareerStats, type RideOutcome, type RideStyle, type ShiftState } from "./rules";
import { fareOf, type RoadUser, type SimState } from "./sim";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(Math.abs(sec)));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const usd = (v: number): string => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stars = (n: number): string => "★".repeat(n) + "☆".repeat(5 - n);
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function createHud(opts: { readonly onToggleStyle: () => void; readonly onRetry: () => void; readonly formatDist: (m: number) => string }) {
  const card = $("taxiCard");
  const trip = $("taxiTrip");
  const sum = $("taxiSum");
  const hint = $("taxiHint");
  const total = $("taxiTotal");
  const status = $("rideStatus");
  const results = $("results");
  const pen = $("taxiPen");
  const toastEl = $("toast");
  let collapsed = false;
  let cardKey = "";
  let tripKey = "";
  let statusText = "";
  let toastTimer = 0;
  const refs: Record<string, HTMLElement | null> = {};
  const ref = (root: HTMLElement | null, sel: string): HTMLElement | null => root?.querySelector<HTMLElement>(sel) ?? null;

  for (const el of [card, trip]) {
    el?.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-toggle-style]")) {
        e.stopPropagation();
        opts.onToggleStyle();
      } else if (t.closest(".tx-head .tg")) {
        collapsed = !collapsed;
        card?.classList.toggle("min", collapsed);
        trip?.classList.toggle("min", collapsed);
      }
    });
  }
  results?.querySelector<HTMLButtonElement>("[data-retry]")?.addEventListener("click", () => opts.onRetry());

  const styleButton = (style: RideStyle, locked: boolean) =>
    `<button type="button" class="style-toggle ${style === "street" ? "street" : ""}" data-toggle-style="1" ${locked ? "disabled" : ""} aria-label="Ride style: ${style === "comfort" ? "comfort" : "street bounty"}${locked ? " (locked for this ride)" : ", press to change"}">${style === "comfort" ? "Comfort" : "Street Bounty"}</button>`;

  function say(text: string): void {
    if (text === statusText || !status) return;
    statusText = text;
    status.textContent = text;
  }

  return {
    toast(title: string, subtitle: string): void {
      if (!toastEl) return;
      toastEl.innerHTML = `<span>${esc(title)}</span><small>${esc(subtitle)}</small>`;
      toastEl.classList.add("on");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove("on"), 2600);
    },
    popup(title: string, detail: string, tone: "good" | "bad" | "nfs"): void {
      if (!pen) return;
      const pop = document.createElement("div");
      pop.className = `pop ${tone}`;
      pop.innerHTML = `<b>${esc(title)}</b><small>${esc(detail)}</small>`;
      pen.appendChild(pop);
      while (pen.children.length > 2) pen.firstElementChild?.remove();
      window.setTimeout(() => pop.remove(), 2400);
    },
    /** 10 Hz: rebuild a card only when its state changes, otherwise touch the numbers. */
    update(s: SimState, playerDrives: boolean, hintText: string | null): void {
      const r = s.ride;
      const fare = fareOf(s);
      const dist = Math.max(0, s.player.z - r.beaconZ);
      const offer = r.state === "offer" || r.state === "boarding";
      const riding = r.state === "ride" || r.state === "alighting";
      const live = s.phase === "driving";
      card?.classList.toggle("on", live && offer);
      trip?.classList.toggle("on", live && riding);
      sum?.classList.toggle("on", live && r.state === "summary");
      trip?.classList.toggle("arc", s.style === "street");

      if (offer && card) {
        const key = `${r.state}:${r.fareIndex}:${s.style}`;
        if (key !== cardKey) {
          cardKey = key;
          card.innerHTML = `
            <div class="tx-head"><div class="tg">${r.state === "boarding" ? "PICKING UP · KERB LOCKED" : `FARE ${Math.min(s.shift.faresDone + 1, SHIFT_FARES)} OF ${SHIFT_FARES} · PICKUP`}</div>${styleButton(s.style, r.state === "boarding")}</div>
            <div class="who"><i style="background:${fare.avatarColor}">${esc(fare.passenger[0]!)}</i><div><b>${esc(fare.passenger)}</b><small>“${esc(fare.quote)}”</small></div></div>
            <div class="leg"><span class="dot p"></span><div><b>${esc(fare.pickupName)}</b><small>${esc(fare.pickupStreet)}</small></div><em data-r="dist"></em></div>
            <div class="leg"><span class="dot d"></span><div><b>${esc(fare.dropoffName)}</b><small>${fare.tripMiles.toFixed(1)} mi · fare ${usd(fare.fareUsd)} · par ${formatClock(fare.parSec)}</small></div><em style="color:#ffb347">DROP-OFF</em></div>`;
          refs.cardDist = ref(card, "[data-r=dist]");
          say(r.state === "boarding" ? `Picking up ${fare.passenger}` : `New fare: ${fare.passenger} at ${fare.pickupName}`);
        }
        if (refs.cardDist) refs.cardDist.textContent = r.state === "boarding" ? "boarding…" : opts.formatDist(dist);
      }

      if (riding && trip) {
        const key = `${r.state}:${r.fareIndex}:${s.style}`;
        if (key !== tripKey) {
          tripKey = key;
          trip.innerHTML = `
            <div class="tx-head"><div class="tg">ACTIVE TRIP · ${esc(fare.passenger.toUpperCase())}</div>${styleButton(s.style, true)}</div>
            <div class="dst"><span class="dot d"></span><div><b>${esc(fare.dropoffName)}</b><small>${esc(fare.dropoffStreet)}</small></div></div>
            <div class="row"><div><small>DISTANCE</small><b data-r="dist"></b></div><div><small>TIME LEFT</small><b data-r="time"></b></div><div><small>FARE</small><b>${usd(fare.fareUsd)}</b></div></div>
            <div class="cf"><small>${s.style === "comfort" ? "COMFORT" : "STREET BOUNTY"}</small><div class="bar"><i data-r="bar"></i></div><b data-r="score"></b></div>`;
          refs.tripDist = ref(trip, "[data-r=dist]");
          refs.tripTime = ref(trip, "[data-r=time]");
          refs.tripBar = ref(trip, "[data-r=bar]");
          refs.tripScore = ref(trip, "[data-r=score]");
          say(r.state === "alighting" ? `Dropping off ${fare.passenger}` : `${fare.passenger} aboard, heading to ${fare.dropoffName}`);
        }
        const left = fare.parSec - r.elapsed;
        if (refs.tripDist) refs.tripDist.textContent = r.state === "alighting" ? "arrived" : opts.formatDist(dist);
        if (refs.tripTime) {
          refs.tripTime.textContent = left >= 0 ? formatClock(left) : `LATE ${formatClock(-left)}`;
          refs.tripTime.classList.toggle("late", left < 0);
        }
        const ratio = s.style === "comfort" ? clamp(r.comfort / 100, 0.02, 1) : clamp((r.multiplier - 1) / 4, 0.05, 1);
        if (refs.tripBar) refs.tripBar.style.transform = `scaleX(${ratio.toFixed(3)})`;
        if (refs.tripScore) refs.tripScore.textContent = s.style === "comfort" ? `${Math.round(r.comfort)}%` : `${r.bounty.toLocaleString("en-US")} ×${r.multiplier.toFixed(2)}`;
      }
      if (!offer) cardKey = "";
      if (!riding) tripKey = "";

      if (hint) {
        hint.classList.toggle("on", live && hintText !== null);
        if (hintText !== null && hint.textContent !== hintText) hint.textContent = hintText;
      }
      if (total) {
        const shiftLeft = Math.max(0, SHIFT_SECONDS - s.shift.elapsedSec);
        const rating = careerRating(s.career);
        const text = `${usd(s.shift.earnedUsd)}|Fare ${Math.min(s.shift.faresDone, SHIFT_FARES)}/${SHIFT_FARES} · shift ${formatClock(shiftLeft)} · ${rating === null ? "no rating yet" : `★ ${rating.toFixed(2)}`}`;
        if (total.dataset.text !== text) {
          total.dataset.text = text;
          const [big, small] = text.split("|");
          total.innerHTML = `<b>${big}</b><small>${small}</small>`;
        }
      }
      void playerDrives;
    },
    showSummary(fareIndex: number, style: RideStyle, outcome: RideOutcome, comfort: number, multiplier: number): void {
      if (!sum) return;
      const fare = FARES[fareIndex % FARES.length]!;
      sum.innerHTML = `
        <div class="tg">RIDE COMPLETE · ${esc(fare.passenger)}</div>
        <div class="st" aria-label="${outcome.stars} of 5 stars">${stars(outcome.stars)}</div>
        <div class="who2">${esc(fare.pickupName)} → ${esc(fare.dropoffName)}${outcome.late ? " · <em class='late'>LATE</em>" : ""}</div>
        <div class="ln"><span>Base fare</span><b>${usd(fare.fareUsd)}</b></div>
        <div class="ln"><span>${style === "comfort" ? `Comfort tip (${Math.round(comfort)}%)` : `Street bounty (×${multiplier.toFixed(2)})`}${outcome.timeFactor < 1 ? ` · late ×${outcome.timeFactor.toFixed(2)}` : ""}</span><b style="color:${outcome.tipUsd > 0 ? "#43d17a" : "#ff5a4f"}">+${usd(outcome.tipUsd)}</b></div>
        <div class="tot"><span>EARNED</span><b>${usd(outcome.earnedUsd)}</b></div>`;
      say(`Ride complete, ${outcome.stars} stars, earned ${usd(outcome.earnedUsd)}`);
    },
    showResults(shift: ShiftState, score: number, best: number, newBest: boolean): void {
      if (!results) return;
      const body = results.querySelector<HTMLElement>("[data-body]");
      const avg = shift.faresDone > 0 ? (shift.starsSum / shift.faresDone).toFixed(1) : "–";
      if (body) {
        body.innerHTML = `
          <div class="ln"><span>Fares</span><b>${shift.faresDone} / ${SHIFT_FARES}</b></div>
          <div class="ln"><span>Earned</span><b>${usd(shift.earnedUsd)}</b></div>
          <div class="ln"><span>Average rating</span><b>${avg} ★</b></div>
          <div class="ln"><span>Collisions · red lights</span><b>${shift.collisions} · ${shift.redLights}</b></div>
          <div class="ln"><span>Missed kerbs · skipped fares</span><b>${shift.missed} · ${shift.skipped}</b></div>
          <div class="ln"><span>${shift.reason === "fares" ? "All fares done" : "Shift clock ran out"}</span><b>${shift.reason === "fares" ? "+$25 bonus" : "no bonus"}</b></div>
          <div class="tot"><span>SCORE</span><b>${score}</b></div>
          <div class="best">${newBest ? "New best shift!" : `Best shift: ${best}`}</div>`;
      }
      results.classList.add("on");
      results.querySelector<HTMLButtonElement>("[data-retry]")?.focus();
      say(`Shift over. Score ${score}. ${newBest ? "New best." : `Best ${best}.`}`);
    },
    hideResults(): void {
      results?.classList.remove("on");
    },
    career(c: CareerStats): string {
      const rating = careerRating(c);
      return `${c.rides} rides · ${rating === null ? "no rating yet" : `★ ${rating.toFixed(2)}`} · best shift ${c.bestShiftScore}`;
    }
  };
}

export type Hud = ReturnType<typeof createHud>;

/** Bottom-left vector radar: the avenue, the route to the beacon, traffic dots and rival arrows. */
export function drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number, s: SimState, rivalAccents: readonly string[]): void {
  const cx = w * 0.5;
  const cy = h * 0.58;
  const scale = 2.1;
  const px = s.player.x;
  const pz = s.player.z;
  ctx.fillStyle = "#0b1017";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#0c2d48";
  ctx.beginPath();
  ctx.moveTo(w * 0.72, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h * 0.48);
  ctx.closePath();
  ctx.fill();
  const scroll = ((-pz * scale) % 96 + 96) % 96;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let row = -3; row <= 4; row++) {
    const by = cy + row * 96 + scroll - 42;
    for (let col = -3; col <= 3; col++) {
      if (col === 0) continue;
      const bx = cx + col * 68 - (col > 0 ? 22 : 42) - px * scale;
      ctx.fillStyle = (row + col) % 4 === 0 ? "#143326" : "#161f2c";
      ctx.fillRect(bx, by, 54, 72);
      ctx.strokeRect(bx, by, 54, 72);
    }
  }
  const roadX = cx - px * scale;
  ctx.fillStyle = "#263244";
  ctx.fillRect(roadX - 22, 0, 44, h);
  ctx.fillStyle = "#222c3c";
  for (let row = -3; row <= 4; row++) ctx.fillRect(0, cy + row * 96 + scroll - 12, w, 24);
  const pickup = s.ride.state === "offer" || s.ride.state === "boarding";
  const color = pickup ? "#3fd6c6" : "#ffb347";
  const bx = roadX + CURB_BEACON_X * scale;
  const by = clamp(cy - (pz - s.ride.beaconZ) * scale, 26, h - 26);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.quadraticCurveTo(cx, (cy + by) * 0.5, bx, by);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(bx, by, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#061412";
  ctx.font = '600 12px "DIN Pro", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pickup ? "P" : "D", bx, by + 0.5);
  const dot = (u: RoadUser): void => {
    const tx = roadX + u.laneX * scale;
    const ty = cy + (u.z - pz) * scale;
    if (ty < 8 || ty > h - 8) return;
    if (u.rival === null) {
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(tx, ty);
    if (u.direction === -1) ctx.rotate(Math.PI);
    ctx.fillStyle = rivalAccents[u.rival] ?? "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  s.users.forEach(dot);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-s.player.yaw);
  ctx.fillStyle = "rgba(63, 214, 198, 0.28)";
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#071018";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7.5, 8);
  ctx.lineTo(0, 4.5);
  ctx.lineTo(-7.5, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
