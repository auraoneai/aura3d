// What the voice is asked to say when it differs from the caption (tools/gen-audio.ts; the content validator checks
// recordings against these). A lone lowercase letter would be read as a word ("a" as "uh"), so the voice gets the
// letter name spelled out while the caption keeps the written letter (05 section 1: letter name and sound apart).
// Not imported by the app: captions always show the line text.
export const SPOKEN_FORMS: Readonly<Record<string, string>> = {
  "e03.little-b.1": "Big Bee, little bee.",
  "e03.little-b.2": "Hello, little bee!",
  "e04.little-a.1": "Big Ay, little ay."
};
