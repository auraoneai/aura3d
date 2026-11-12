// English locale entries for the four calm bedtime activities (G13–G16,
// SleepingBaby-Songs-Games.PRD). Every spoken line is 12 words or fewer,
// warm and unhurried, free of pressure phrases, family names, and numbers > 3.

export interface StoryLocaleEntries {
  readonly lines: Readonly<Record<string, string>>;
  readonly strings: Readonly<Record<string, string>>;
}

export const EN_G13: StoryLocaleEntries = {
  lines: {
    "g13.hello.1": "Hello, sleepy friend.",
    "g13.hello.2": "It is quiet night in our room.",
    "g13.cozy-room.1": "Look at the soft bed and warm blanket.",
    "g13.cozy-room.2": "Let's tuck our friends in to sleep.",
    "g13.tuck.1": "Teddy is ready for bed.",
    "g13.tuck.2": "Pull up the warm blanket?",
    "g13.tuck.r1": "Warm blanket on the bed.",
    "g13.tuck.r2": "Teddy is snug and warm.",
    "g13.tuck.11": "Sheru wants his cozy bed.",
    "g13.tuck.12": "Share the soft blanket?",
    "g13.tuck.r11": "Soft blanket on the bed.",
    "g13.tuck.r12": "Sheru curls up to rest.",
    "g13.tuck.21": "Sleepy Peeko wants a warm bed.",
    "g13.tuck.22": "Tuck Peeko under the blanket?",
    "g13.tuck.r21": "Cozy blanket, little cradle bed.",
    "g13.tuck.r22": "Hush now, so warm.",
    "g13.hush.1": "Hush now, time to sleep.",
    "g13.hush.2": "So soft, warm, and sleepy.",
    "g13.more.1": "More friends ready to sleep?",
    "g13.goodnight.1": "Every friend is warm in bed.",
    "g13.goodnight.2": "All done. Shh, time to sleep."
  },
  strings: {
    "g13.title": "Tuck In Friends",
    "g13.offline":
      "Lay a plush toy on a pillow, pull a soft blanket up to its chin, and whisper \"warm blanket, time to sleep\" together.",
    "g13.bridge":
      "Tucking a favourite toy into bed mirrors your own bedtime routine. Name \"bed\", \"blanket\" and \"sleep\" in a slow, hushed voice, and let silence do the work if your child is already drowsy.",
    "g13.tip.1": "No need to tap if your arms are full. After a calm pause, Momo tucks each friend in gently on his own.",
    "g13.tip.2": "Let the round rest when your child's eyes grow heavy; the lullaby will begin softly by itself."
  }
};

export const EN_G14: StoryLocaleEntries = {
  lines: {
    "g14.hello.1": "Hello, friend. Look at the moon.",
    "g14.hello.2": "Everything is calm and quiet.",
    "g14.box-intro.1": "See the little stars up high?",
    "g14.box-intro.2": "Open the box for a quiet tune.",
    "g14.chime.1": "Touch the box or the soft stars?",
    "g14.chime.r1": "Little stars turn in the quiet room.",
    "g14.chime.r2": "The golden moon shines softly.",
    "g14.chime.11": "Tap for soft stars and chimes?",
    "g14.chime.r11": "Soft stars drift in the quiet night.",
    "g14.chime.r12": "Moon glow warms the cradle.",
    "g14.chime.21": "Another turn for the soft stars?",
    "g14.chime.r21": "Stars shine softly over Teddy.",
    "g14.chime.r22": "Everything feels calm and quiet.",
    "g14.rock-teddy.1": "Momo rocks Teddy under the moon.",
    "g14.rock-teddy.2": "Slow and quiet, hush now.",
    "g14.more.1": "More quiet stars and music?",
    "g14.goodnight.1": "The music box closes for the moon and stars.",
    "g14.goodnight.2": "All done. Quiet sleep, little friend."
  },
  strings: {
    "g14.title": "Starlight Music Box",
    "g14.offline":
      "Sway slowly together in a dim room, hum a quiet cradle tune, and whisper \"moon\" and \"stars\" before laying down to rest.",
    "g14.bridge":
      "Slow, predictable chimes help signal that playtime is over. Keep your voice soft, name \"star\", \"moon\" and \"quiet\", and let your child simply listen and watch.",
    "g14.tip.1": "Watching quietly is a full turn. The music box opens gently whether someone taps or just listens.",
    "g14.tip.2": "Pause and let the room stay still; when the wait finishes, the instrumental music box plays softly."
  }
};

export const EN_G15: StoryLocaleEntries = {
  lines: {
    "g15.hello.1": "Hello, friend. Night is here.",
    "g15.hello.2": "The moon glows in the quiet night.",
    "g15.lights-hook.1": "Look at the warm little lights.",
    "g15.lights-hook.2": "Let's say hush and dim them for sleep.",
    "g15.dim-light.1": "Time to close up for the night?",
    "g15.dim-light.r1": "Close the shutters, night-night.",
    "g15.dim-light.r2": "Hush now, little light.",
    "g15.dim-light.11": "Close the little house for the night?",
    "g15.dim-light.r11": "The cozy house is closed now.",
    "g15.dim-light.r12": "Hush, quiet night.",
    "g15.dim-light.21": "Dim the lamp and close our eyes at night?",
    "g15.dim-light.r21": "Warm amber glow, soft and low.",
    "g15.dim-light.r22": "Hush now, ready for bed.",
    "g15.whisper-hush.1": "Hush, hush, soft and low.",
    "g15.whisper-hush.2": "Eyelids close in the cozy night.",
    "g15.more.1": "Say night-night to more little lights?",
    "g15.goodnight.1": "Little lights rest, and eyelids close.",
    "g15.goodnight.2": "All done. Hush now, night-night."
  },
  strings: {
    "g15.title": "Goodnight, Little Lights",
    "g15.offline":
      "Walk around the room together dimming lamps or closing curtains, whispering \"close\" and \"night-night\" at each stop.",
    "g15.bridge":
      "Saying goodnight to familiar lamps and windows turns dimming the room into a comforting cue for rest. Model \"close\", \"night\" and a gentle \"hush\" as you settle in.",
    "g15.tip.1": "A sleepy glance or stillness is plenty. Each warm light dims gently on its own after the pause.",
    "g15.tip.2": "When you are ready to rest, let the timer pass without tapping to glide straight into the lullaby."
  }
};

export const EN_G16: StoryLocaleEntries = {
  lines: {
    "g16.hello.1": "Hello, sleepy friend.",
    "g16.hello.2": "Welcome to our soft sky cloud.",
    "g16.fluffy-hook.1": "Look at the fluffy sheep.",
    "g16.fluffy-hook.2": "Each soft cloud is a cozy pillow.",
    "g16.float-sheep.1": "Help the soft sheep rest on a cloud?",
    "g16.float-sheep.r1": "Baa, baa, onto the soft cloud.",
    "g16.float-sheep.r2": "The sleepy sheep settles down.",
    "g16.float-sheep.11": "Settle another soft sheep on a cloud?",
    "g16.float-sheep.r11": "Soft sheep, warm on the cloud.",
    "g16.float-sheep.r12": "Baa, baa, nice and cozy.",
    "g16.float-sheep.21": "Pat the soft sheep on their cloud?",
    "g16.float-sheep.r21": "Every soft sheep is snug.",
    "g16.float-sheep.r22": "Resting together on a sleepy cloud.",
    "g16.sheep-yawn.1": "Hush now, warm blanket and quiet sky.",
    "g16.sheep-yawn.2": "Slow breaths on a soft cloud.",
    "g16.more.1": "More soft sheep on the cloud?",
    "g16.goodnight.1": "Soft sheep rest on their fluffy cloud.",
    "g16.goodnight.2": "All done. Shh, time to sleep."
  },
  strings: {
    "g16.title": "Cloud Sheep Hush",
    "g16.offline":
      "Stroke a soft blanket or plush lamb together, take a slow calm breath, and whisper \"soft sheep, soft cloud\".",
    "g16.bridge":
      "Gentle sensory words like \"soft\" and \"cloud\" pair naturally with stroking a blanket or cuddling before bed. Keep movements slow and let quiet pauses stretch.",
    "g16.tip.1": "Hands-free friendly: if nobody taps, the wooly sheep drifts onto its cloud pillow all by itself.",
    "g16.tip.2": "Rest your hand gently on a blanket together as the cradle music carries the scene to sleep."
  }
};
