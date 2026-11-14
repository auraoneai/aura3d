// English locale lines and caregiver strings for S01E01 — "Welcome to Wonder World!" (PRD 09 E.3, E.6, E.7).
// Every spoken line has <= 9 words (Band 2 toddler cap), zero banned phrases, zero family names, and zero child names.

import type { LocalePart } from "../index.js";

export const lines: Readonly<Record<string, string>> = {
  // Segment 1 — Cold open & Wonder World theme
  "s01e01.s1-island.1": "Far away, there is a sunny little island.",
  "s01e01.s1-island.2": "It is called... Wonder World!",
  "s01e01.s1-late-lulu.1": "Hello! Oops, I waved a little late!",
  "s01e01.s1-late-lulu.2": "Hello, Lulu! We love your happy wave!",
  "s01e01.s1-big-news.1": "Hi! I'm Momo. Guess what?",
  "s01e01.s1-big-news.2": "You are our new friend!",
  "s01e01.s1-big-news.3": "Let's make a welcome party together!",

  // Segment 2 — Sheru's three-fetch gag & count 1
  "s01e01.s2-five-things.1": "Our welcome party needs five fun things.",
  "s01e01.s2-five-things.2": "Uh-oh! We have zero things right now!",
  "s01e01.s2-ask-sheru.1": "Sheru! Please find a red ball!",
  "s01e01.s2-fetch-duck.1": "Uh-oh! Is that a ball?",
  "s01e01.s2-fetch-duck.2": "Nooo! That's a yellow duck, Sheru!",
  "s01e01.s2-fetch-sponge.1": "A squishy sponge? Silly puppy!",
  "s01e01.s2-fetch-sponge.2": "Let's look for the round red ball!",
  "s01e01.s2-ball-arrives.1": "Ooh! Look what Sheru rolled out!",
  "s01e01.s2-pause-1.1": "Where is the red ball?",
  "s01e01.s2-pause-1.2": "There it is! Thank you, friend!",
  "s01e01.s2-pause-1.3": "Hooray, Sheru! You found the red ball!",
  "s01e01.s2-count-1.1": "One! One red ball!",
  "s01e01.s2-count-1.2": "One party thing for our friend.",
  "s01e01.s2-next.1": "Now we need a train ride. GoGo!",

  // Segment 3 — Ready... Go! with GoGo & count 2
  "s01e01.s3-arrive.1": "Choo-choo! Hello, friends! I'm GoGo!",
  "s01e01.s3-arrive.2": "Hi, GoGo! May we take a party ride?",
  "s01e01.s3-arrive.3": "Yes! All aboard my little train!",
  "s01e01.s3-count-carriages.1": "Look at my carriages! Let's count together.",
  "s01e01.s3-count-carriages.2": "One... two... three!",
  "s01e01.s3-count-carriages.3": "Three colourful carriages! Thank you, GoGo!",
  "s01e01.s3-board.1": "I'm riding carriage one! Ready, GoGo?",
  "s01e01.s3-pause-2.1": "Ready... steady...",
  "s01e01.s3-pause-2.2": "Go! Off we go!",
  "s01e01.s3-pause-2.3": "Chugga, chugga, down the sunny track!",
  "s01e01.s3-butterfly.1": "Stop! Excuse me, butterfly. You first!",
  "s01e01.s3-butterfly.2": "Aww, GoGo always says excuse me!",
  "s01e01.s3-count-2.1": "Two! A ball, and a ride!",
  "s01e01.s3-depart.1": "Next stop... the Music Garden!",

  // Segment 4 — Lulu's Boom-Boom Beat & count 3
  "s01e01.s4-hi.1": "La la la! Hello, party friends!",
  "s01e01.s4-hi.2": "Lulu! We need a song for our party!",
  "s01e01.s4-boom.1": "A song? I love songs! Boom, boom!",
  "s01e01.s4-boom.2": "Stomp your feet with me! Stomp, stomp!",
  "s01e01.s4-pause-3.1": "Your turn! Stomp, stomp!",
  "s01e01.s4-pause-3.2": "Boom, boom! Happy dino stomping!",
  "s01e01.s4-late-clap.1": "Now clap!",
  "s01e01.s4-late-clap.2": "Clap! Oops, I'm one beat late again!",
  "s01e01.s4-late-freeze.1": "I stopped! Just a tiny bit late!",
  "s01e01.s4-late-freeze.2": "Thank you for the joyful song, Lulu!",
  "s01e01.s4-pause-4.1": "Ready to freeze? Dance, dance... stop!",
  "s01e01.s4-pause-4.2": "Wow! You froze just like a statue!",
  "s01e01.s4-count-3.1": "Three! A ball, a ride, a song!",
  "s01e01.s4-next.1": "Come on! Let's go find Peeko!",

  // Segment 5 — Peekaboo with Peeko & count 4
  "s01e01.s5-arrive.1": "Peeko? Where are you, Peeko?",
  "s01e01.s5-hiding.1": "Shh! You can't see me! I'm hiding!",
  "s01e01.s5-pause-5.1": "Hmm... where is Peeko hiding?",
  "s01e01.s5-pause-5.2": "Behind the tiny box! You found Peeko!",
  "s01e01.s5-pause-5.3": "Peekaboo! Here I am!",
  "s01e01.s5-game-ask.1": "Peeko, that toy box is tiny!",
  "s01e01.s5-game-ask.2": "Tweet! Peekaboo is our party game!",
  "s01e01.s5-hat-drop.1": "Ooh! Now I'm hiding! Where am I?",
  "s01e01.s5-pause-6.1": "Where is Momo?",
  "s01e01.s5-pause-6.2": "Under the hat! Peekaboo, Momo!",
  "s01e01.s5-pause-6.3": "Peekaboo! Thank you, Peeko!",
  "s01e01.s5-count-4.1": "Four! A ball, a ride, a song, a game!",
  "s01e01.s5-next.1": "One more! Let's visit Lumi up high!",

  // Segment 6 — Lumi's Look-What-I-Found preview & count 5
  "s01e01.s6-hi.1": "Hello, friends. Welcome to Learning Cloud.",
  "s01e01.s6-hi.2": "Hi, Lumi! We need one more party thing!",
  "s01e01.s6-stars.1": "How about warm, twinkly stars?",
  "s01e01.s6-stars.2": "Five! Stars! Yes, please!",
  "s01e01.s6-apple.1": "Look what we will discover together!",
  "s01e01.s6-apple.2": "Hmm... is that a yellow banana?",
  "s01e01.s6-apple.3": "Look closely! It's a shiny red apple!",
  "s01e01.s6-blocks.1": "Now look at these colourful toy blocks!",
  "s01e01.s6-pause-7.1": "Let's count the blocks together!",
  "s01e01.s6-pause-7.2": "One, two, three! Three big blocks!",
  "s01e01.s6-pause-7.3": "Uh-oh, tumble! Stacking blocks is fun!",
  "s01e01.s6-letter.1": "Look, a letter! This is B. Bee!",
  "s01e01.s6-letter.2": "B says b-b-ball! Buh, ball!",
  "s01e01.s6-cow.1": "Ooh! Is that a little puppy?",
  "s01e01.s6-cow.2": "That's a friendly cow! Moo!",
  "s01e01.s6-drum-moon.1": "A little drum! Quiet... boom!",
  "s01e01.s6-drum-moon.2": "And a sleepy moon for bedtime. Shh.",
  "s01e01.s6-count-5.1": "Five! Ball, ride, song, game, and stars!",
  "s01e01.s6-count-5.2": "Hooray! Everyone to Momo's house!",

  // Segment 7 — The Welcome Party at Home Nook
  "s01e01.s7-welcome.1": "Look! The welcome party is ready!",
  "s01e01.s7-welcome.2": "Welcome to Wonder World, new friend!",
  "s01e01.s7-recap-1-3.1": "Let's count! One, Sheru's bouncy red ball!",
  "s01e01.s7-recap-1-3.2": "Two, GoGo's choo-choo train ride!",
  "s01e01.s7-recap-1-3.3": "Three, Lulu's boom-boom song!",
  "s01e01.s7-recap-4-5.1": "Four, Peeko's peekaboo game!",
  "s01e01.s7-recap-4-5.2": "And five, Lumi's twinkly stars!",
  "s01e01.s7-pause-8.1": "Wave hello to all your friends!",
  "s01e01.s7-pause-8.2": "Hello, hello! Five wonderful party things!",
  "s01e01.s7-sponge-callback.1": "Oh, Sheru! Not the sponge again!",
  "s01e01.s7-sponge-callback.2": "Hehe! Silly Sheru loves that sponge!",
  "s01e01.s7-thanks.1": "Thank you, friends! Best welcome party ever!",
  "s01e01.s7-thanks.2": "Choo-choo! Hooray for our new friend!",

  // Segment 8 — All Done, Goodnight
  "s01e01.s8-yawn.1": "What a big day. Time for cosy rest.",
  "s01e01.s8-byes.1": "Bye-bye! Choo-choo!",
  "s01e01.s8-byes.2": "Bye-bye! Boom... boom!",
  "s01e01.s8-byes.3": "Bye-bye! Peekaboo!",
  "s01e01.s8-byes.4": "See you soon in Wonder World, friend.",
  "s01e01.s8-goodnight.1": "Quiet stars shine while friends drift to sleep.",
  "s01e01.s8-goodnight.2": "Goodnight, friends. Sweet dreams."
};

export const strings: Readonly<Record<string, string>> = {
  "s01e01.title": "Welcome to Wonder World!",
  "s01e01.offlinePlay":
    "All done! Now try... Find five things for a pretend party: a ball, a toy car, a song, a peekaboo game and a star.",
  "s01e01.caregiverBridge":
    "Count the party things on your fingers together: one, two, three, four, five.",
  "s01e01.ch.theme": "Wonder World song",
  "s01e01.ch.sheru": "Sheru finds a ball (1)",
  "s01e01.ch.gogo": "GoGo's train ride (2)",
  "s01e01.ch.lulu": "Lulu's stomp and freeze song (3)",
  "s01e01.ch.peeko": "Peekaboo with Peeko (4)",
  "s01e01.ch.lumi": "Lumi's look-what-I-found (5)",
  "s01e01.ch.party": "The welcome party",
  "s01e01.ch.goodnight": "Bye-bye and goodnight",
  "s01e01.pause.1": "[pause: point to the ball!]",
  "s01e01.pause.2": "[pause: say \"go!\"]",
  "s01e01.pause.3": "[pause: stomp together]",
  "s01e01.pause.4": "[pause: freeze like a statue!]",
  "s01e01.pause.5": "[pause: point to the box]",
  "s01e01.pause.6": "[pause: find Momo under the hat!]",
  "s01e01.pause.7": "[pause: count one, two, three]",
  "s01e01.pause.8": "[pause: wave hello!]"
};

export const EN_S01E01: LocalePart = {
  source: "shows/s01e01-welcome-to-wonder-world",
  lines,
  strings
};
