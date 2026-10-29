// English UI and grown-up strings (PRD 04 C07/E01-E08; PRD 01 sections 6-9).
//
// Child-facing screens are nearly text-free; these strings are for the
// grown-up: the start screen, menu, controls, parent gate, parent panel,
// guidance, the safety and privacy notes and song titles. The public title is
// "Wonder World"; no child's name appears anywhere. Placeholders: {s} in
// ui.parent.seconds, {n} and {max} in ui.parent.wordsCount.

export const lines: Record<string, string> = {};

export const strings: Record<string, string> = {
  // Start screen.
  "ui.start.title": "Wonder World",
  "ui.start.tap": "Tap to start",
  "ui.start.sound": "Sound starts after you tap.",
  "ui.prototype": "Prototype",
  "ui.loading": "Getting ready...",
  "ui.stage.unavailable": "The 3D pictures could not start on this device. Reload the page or try another browser.",
  "ui.audio.unavailable": "Sound is not available right now. The story carries on with pictures, and captions show the words.",

  // Modes.
  "ui.mode.label": "How do you want to play?",
  "ui.mode.play": "Play together",
  "ui.mode.watch": "Watch and sing",

  // Menu.
  "ui.menu.title": "Choose a story or a game",
  "ui.menu.label": "Stories and games",
  "ui.menu.episodes": "Stories",
  "ui.menu.activities": "Games",

  // Grown-up controls during play.
  "ui.controls.label": "Grown-up controls",
  "ui.pause": "Pause",
  "ui.resume": "Resume",
  "ui.replay": "Replay word",
  "ui.allDone": "All done",
  "ui.parentButton": "Grown-up settings",
  // The grown-up's confirm during a turn: the story answers as for a tap. It never judges what the child did.
  "ui.confirm": "Your child had a turn",
  "ui.captions.label": "Captions",

  // End-of-story card.
  "ui.offline.title": "All done! Now try...",
  "ui.offline.done": "Back to stories",

  // Parent gate (ordinary UX, not a lock).
  "ui.gate.title": "For grown-ups",
  "ui.gate.hold": "Press and hold the button for 2 seconds to open settings.",
  "ui.gate.button": "Hold to open",
  "ui.gate.holding": "Keep holding...",
  "ui.gate.again": "Keep holding a little longer.",
  "ui.gate.cancel": "Not now",
  "ui.gate.note": "This step keeps settings out of the way during play. It is not a lock.",

  // Parent panel.
  "ui.parent.title": "Grown-up settings",
  "ui.parent.open": "Grown-up settings",
  "ui.parent.close": "Close settings",
  "ui.parent.back": "Back to the story",
  "ui.parent.exit": "Exit to menu",
  "ui.parent.clear": "Clear settings on this device",
  "ui.parent.reset": "Clear settings on this device",
  "ui.parent.mode": "Mode",
  "ui.parent.display": "Sound and display",
  "ui.parent.music": "Music",
  "ui.parent.sound": "Sound and voices",
  // The grown-up's sound-effect level (PRD 01 section 9; 07 B20).
  "ui.parent.sfx": "Sound effects",
  "ui.parent.sfxHelp": "Animal sounds, pops and bells. Voices and songs keep their level.",
  "ui.parent.sfx.off": "Off",
  "ui.parent.sfx.soft": "Soft",
  "ui.parent.sfx.normal": "Normal",
  "ui.parent.captions": "Captions",
  "ui.parent.reducedMotion": "Calm motion",
  "ui.parent.highContrast": "High contrast and larger text",
  "ui.parent.wait": "Waiting time for a turn",
  "ui.parent.waitHelp": "How long a character pauses for your child. The story always carries on by itself.",
  "ui.parent.seconds": "{s} seconds",
  "ui.parent.words": "Words for today",
  "ui.parent.wordsHelp": "Pick up to 5 words to use often while you play. This list stays on this device and does not track progress.",
  "ui.parent.wordsEmpty": "No words are available yet.",
  "ui.parent.wordsCount": "{n} of {max} chosen",
  "ui.parent.locale": "Language",
  "ui.parent.language": "Language",
  "ui.parent.locale.en": "English",

  // Guidance (PRD 01 section 6).
  "ui.guide.title": "Ways to play together",
  "ui.guide.1": "Label what your child notices.",
  "ui.guide.2": "Wait for a turn.",
  "ui.guide.3": "Expand a sound or gesture.",
  "ui.guide.4": "Try with a real toy.",

  // Notes: start, safety, privacy, further reading (PRD 01 sections 6-8, 11).
  "ui.note.title": "About Wonder World",
  "ui.note.start": "Play alongside your child when you can. All activities work by touch; speaking isn't required.",
  "ui.note.safety":
    "This is play and language exposure, not therapy. Wonder World does not test, score or diagnose, and it makes no promise about speech. If you have questions about your child's speech, language or hearing, talk with your pediatrician or a speech-language pathologist.",
  "ui.note.privacy": "No account, no microphone, nothing leaves this device. No ads and no tracking. Settings stay here, and you can clear them at any time.",
  "ui.note.links": "Reading for grown-ups:",
  "ui.note.aap": "AAP: Media and Young Minds",
  "ui.note.asha": "ASHA: Speech and language development",

  // Song titles (src/content/songs.ts titleKey).
  "ui.song.hello": "Hello Song",
  "ui.song.allDone": "All Done Song",
  "ui.song.ballRolls": "The Ball Rolls",
  "ui.song.goStop": "Go / Stop with Lulu",
  "ui.song.faceSong": "Silly Faces",
  "ui.song.peekaboo": "Peekaboo Song",
  "ui.song.animalBand": "The Little Animal Band",
  "ui.song.countToThree": "Count to Three",
  "ui.song.bubbleSong": "Bubble Song",
  "ui.song.birthday": "Little Cake Song",
  "ui.song.colours": "Red and Blue",
  "ui.song.shapes": "Shapes in the Bakery",
  "ui.song.trainSong": "GoGo's Train Song",
  "ui.song.routine": "Momo's Day Song",
  "ui.song.abc": "B Is for Ball",
  "ui.song.lullaby": "Moon Lullaby",

  // Caption speaker names (the narrator has no label).
  "ui.speaker.momo": "Momo",
  "ui.speaker.lulu": "Lulu",
  "ui.speaker.sheru": "Sheru",
  "ui.speaker.gogo": "GoGo",
  "ui.speaker.lumi": "Lumi",
  "ui.speaker.peeko": "Peeko",
  "ui.speaker.robot": "Little Robot"
};
