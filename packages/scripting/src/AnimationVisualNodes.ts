import type { VisualNodeDefinition } from "./VisualNodeCatalog";

const flowInput = () => ({ id: "in", direction: "input" as const, type: "flow" as const, optional: true });
const stringInput = (id: string, optional = false) => ({ id, direction: "input" as const, type: "string" as const, ...(optional ? { optional: true } : {}) });
const numberInput = (id: string, defaultValue = 0) => ({ id, direction: "input" as const, type: "number" as const, defaultValue });
const objectInput = (id: string, optional = false) => ({ id, direction: "input" as const, type: "object" as const, ...(optional ? { optional: true } : {}) });
const commandOutputs = () => [{ id: "out", direction: "output" as const, type: "flow" as const }, { id: "command", direction: "output" as const, type: "object" as const }];

export const animationVisualNodeDefinitions: readonly VisualNodeDefinition[] = [
  node("setScene", "scene", "Set Scene", "Switch to a named animation scene.", [flowInput(), stringInput("sceneId")]),
  node("transitionTo", "scene", "Transition To", "Transition to a animation scene with a named transition.", [flowInput(), stringInput("sceneId"), stringInput("transition", true), numberInput("duration", 0.5)]),
  node("loadSet", "scene", "Load Set", "Load a animation set asset into the episode scene.", [flowInput(), stringInput("setId")]),
  node("spawnCharacter", "scene", "Spawn Character", "Spawn a character asset at a scene position.", [flowInput(), stringInput("characterId"), objectInput("position", true)]),
  node("sayLine", "dialogue", "Say Line", "Schedule a dialogue line for a speaker.", [flowInput(), stringInput("speakerId"), stringInput("text"), stringInput("emotion", true)]),
  node("waitForResponse", "dialogue", "Wait For Response", "Block until a response beat or timeout.", [flowInput(), stringInput("speakerId", true), numberInput("timeout", 1)]),
  node("setEmotion", "dialogue", "Set Emotion", "Set a character performance emotion.", [flowInput(), stringInput("characterId"), stringInput("emotion")]),
  node("setGesture", "dialogue", "Set Gesture", "Set a character performance gesture.", [flowInput(), stringInput("characterId"), stringInput("gestureId")]),
  node("animationCutTo", "camera", "Animation Cut To", "Cut to a named animation camera preset.", [flowInput(), stringInput("presetId"), stringInput("targetId", true)]),
  node("dollyTo", "camera", "Dolly To", "Dolly the camera to a target framing.", [flowInput(), objectInput("position"), numberInput("duration", 1)]),
  node("frameCharacter", "camera", "Frame Character", "Frame a character with composition rules.", [flowInput(), stringInput("characterId"), stringInput("composition", true)]),
  node("shakeCamera", "camera", "Shake Camera", "Add animation camera shake.", [flowInput(), numberInput("intensity", 0.2), numberInput("duration", 0.25)]),
  node("playMusic", "audio", "Play Music", "Start a music cue.", [flowInput(), stringInput("musicId"), numberInput("volume", 1)]),
  node("stopMusic", "audio", "Stop Music", "Stop the current music cue.", [flowInput(), stringInput("musicId", true)]),
  node("playSfx", "audio", "Play SFX", "Play a sound effect cue.", [flowInput(), stringInput("sfxId"), numberInput("volume", 1)]),
  node("setVolume", "audio", "Set Volume", "Set an audio bus volume.", [flowInput(), stringInput("busId"), numberInput("volume", 1)]),
  node("waitForBeat", "timing", "Wait For Beat", "Wait for a named story beat.", [flowInput(), stringInput("beatId")]),
  node("syncToAudio", "timing", "Sync To Audio", "Synchronize downstream actions to an audio timestamp.", [flowInput(), stringInput("audioId"), numberInput("time", 0)]),
  node("delay", "timing", "Delay", "Delay a animation action by seconds.", [flowInput(), numberInput("duration", 1)]),
  node("schedule", "timing", "Schedule", "Schedule a animation command at a timeline time.", [flowInput(), numberInput("time", 0), stringInput("label", true)]),
  node("captureThumbnail", "publishing", "Capture Thumbnail", "Mark a thumbnail capture time.", [flowInput(), numberInput("time", 0), stringInput("path", true)]),
  node("exportCaption", "publishing", "Export Caption", "Export a caption track in VTT or SRT format.", [flowInput(), stringInput("format", true), stringInput("path", true)]),
  node("markChapter", "publishing", "Mark Chapter", "Create a video chapter marker.", [flowInput(), stringInput("title"), numberInput("time", 0)])
];

function node(kind: string, category: VisualNodeDefinition["category"], title: string, description: string, inputs: VisualNodeDefinition["ports"]): VisualNodeDefinition {
  return {
    kind,
    category,
    title,
    description,
    ports: [...inputs, ...commandOutputs()],
    oldBranchSource: ["packages/scripting/src/AnimationVisualNodes.ts"]
  };
}
