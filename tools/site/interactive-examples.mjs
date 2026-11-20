export const interactiveExamples = [
  { slug: "ember-courier", title: "Ember Courier", description: "Guide an armored courier through a night-shift port and dash between three relay beacons in this interactive Aura3D character example." },
  { slug: "vesper-gt", title: "Vesper GT", description: "Orbit an oxblood grand touring coupe, inspect its front wheel and switch between daylight and tungsten lighting in the Aura3D studio." },
  { slug: "relay-workcell", title: "Relay Workcell", additionalSources: ["kinematics"], description: "Follow an industrial robot as it picks up a part, moves it through its workcell and places it at its destination in an interactive Aura3D simulation." },
];

const commonSources = ["main", "stage", "aura-assets"];

/** @returns {Array<[string, string]>} */
export function sceneSourceEntries() {
  return interactiveExamples.flatMap(({ slug, additionalSources = [] }) => {
    return [...commonSources, ...additionalSources].map((file) => [
      `/apps/${slug}/${file}.ts.txt`, `apps/${slug}/src/${file}.ts`
    ]);
  });
}
