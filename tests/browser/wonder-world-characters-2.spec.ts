/**
 * Wonder World character sheets, part 2 of 2: Gogo (G02 gogo-train), Lumi (E03 alphabet-zoo) and Peeko (E02
 * peekaboo-palace; the opening keeps Peeko hidden, so the phone wide shot shows it at its spot). PRD 02 section 2
 * character approval deliverables (gaps 02:28, 02:29, 02:31/02:128, 02:34); Momo, Lulu and Sheru are in
 * wonder-world-characters.spec.ts, and wonder-world-capture-lib.ts describes what each sheet holds and asserts.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh characters-2   (estimated 25-30 min)
 *
 * Records: WWJSON char-gogo, char-lumi, char-peeko and chars-gogo-lumi-peeko-summary; WWSHOT char-<id>-phone,
 * char-<id>-turn-<front|left|back|right>, char-<id>-pose-<neutral|delighted|curious|surprised|waiting|good-bye>.
 */
import { defineCharacterSheetSuite } from "./wonder-world-capture-lib";
import { CHARACTER_STORIES } from "./wonder-world-lib";

defineCharacterSheetSuite({
  title: "Wonder World character sheets (Gogo, Lumi, Peeko)",
  characters: CHARACTER_STORIES.filter((entry) => entry.character === "gogo" || entry.character === "lumi" || entry.character === "peeko")
});
