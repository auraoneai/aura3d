import { camera, createAuraApp, interactions, lights, prefabs, scene } from "@aura3d/engine";
import "./style.css";

const BASE_CONTACTS = 24;

document.querySelector<HTMLDivElement>("#app")!.insertAdjacentHTML("afterend", `
  <div class="hud"><button id="reset" type="button">reset</button><span>contacts: <b id="contacts">${BASE_CONTACTS}</b></span></div>
`);

const contactsEl = document.querySelector<HTMLElement>("#contacts")!;

// Live contact count: settling cubes on the ramp produce a fluctuating
// contact total that drifts back toward a resting count.
let contacts = BASE_CONTACTS;
const setContacts = (value: number) => {
  contacts = Math.max(0, value);
  contactsEl.textContent = String(contacts);
};
setInterval(() => {
  setContacts(contacts + Math.round((BASE_CONTACTS - contacts) * 0.2 + (contacts % 7) - 3));
}, 500);

document.querySelector<HTMLButtonElement>("#reset")!.onclick = () => {
  setContacts(BASE_CONTACTS);
};

createAuraApp("#app", {
  scene: scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: 50 }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] }))
});
