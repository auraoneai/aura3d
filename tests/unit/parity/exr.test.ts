/**
 * The 64 x 48 RGBA fixtures in tests/fixtures/exr were encoded with the
 * OpenEXR reference library. Their channels contain independently specified
 * gradients (R = 2x/63, G = 1.5y/47, B = 0.25 + (x+y)/110, A = 1).
 *
 * Read the raw channel samples from the uncompressed fixtures directly as an
 * oracle. The test does not use another renderer's decoder, and it compares
 * every sample of every compressed fixture, including the PIZ wavelet path.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { afterEach, describe, expect, test, vi } from "vitest";
import { EXRLoader, compositeDeepEXR, parseDeepEXR, parseEXR } from "../../../packages/assets/src/EXRLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import type { AssetLoadProgress } from "../../../packages/assets/src/AssetLoader";

afterEach(() => vi.unstubAllGlobals());

const WIDTH = 64;
const HEIGHT = 48;
type Precision = "half" | "float";

// Authored for this suite with OpenEXR 3.4.6 OutputFile: 16 x 16,
// one Y channel with Y = (x + y) / 16, encoded with PXR24.
const pxrFixtures: Record<Precision, string> = {
  half: "di8xAQIAAABjaGFubmVscwBjaGxpc3QAEwAAAFkAAQAAAAAAAAABAAAAAQAAAABjb21wcmVzc2lvbgBjb21wcmVzc2lvbgABAAAABWRhdGFXaW5kb3cAYm94MmkAEAAAAAAAAAAAAAAADwAAAA8AAABkaXNwbGF5V2luZG93AGJveDJpABAAAAAAAAAAAAAAAA8AAAAPAAAAbGluZU9yZGVyAGxpbmVPcmRlcgABAAAAAHBpeGVsQXNwZWN0UmF0aW8AZmxvYXQABAAAAAAAgD9zY3JlZW5XaW5kb3dDZW50ZXIAdjJmAAgAAAAAAAAAAAAAAHNjcmVlbldpbmRvd1dpZHRoAGZsb2F0AAQAAAAAAIA/AB0BAAAAAAAAAAAAAFMAAAB4XoXKSwqAMBAE0ZngcVyI+HfTR8vRBTWE9ECntq9sHFJydzcqf3U4T5oxa8aiGatmbJqxa8ahOTgxTvJ/KBycGBf5O1QOToyb3FoOTowHufhRTQ==",
  float: "di8xAQIAAABjaGFubmVscwBjaGxpc3QAEwAAAFkAAgAAAAAAAAABAAAAAQAAAABjb21wcmVzc2lvbgBjb21wcmVzc2lvbgABAAAABWRhdGFXaW5kb3cAYm94MmkAEAAAAAAAAAAAAAAADwAAAA8AAABkaXNwbGF5V2luZG93AGJveDJpABAAAAAAAAAAAAAAAA8AAAAPAAAAbGluZU9yZGVyAGxpbmVPcmRlcgABAAAAAHBpeGVsQXNwZWN0UmF0aW8AZmxvYXQABAAAAAAAgD9zY3JlZW5XaW5kb3dDZW50ZXIAdjJmAAgAAAAAAAAAAAAAAHNjcmVlbldpbmRvd1dpZHRoAGZsb2F0AAQAAAAAAIA/AB0BAAAAAAAAAAAAAGcAAAB4XoXOMQGAQAxD0RsZkVAJGABOAhKQgIRKQQpSkMIADEmHnzF5Q9rcNJm9R0SMb2xtwItfvFA++OzeOPpUjv5Ujv5Sjv5WXvzqhXL0xtF/d36OflKOvitHvylHvytHfygv/gHnxxkf"
};
// Same encoder and dimensions: R=float32 (x+y)/7, G=half (x+y)/16,
// and B=uint32 x*10+y. PXR24 quantizes float32 to 24 bits.
const pxrMixedFixture = "di8xAQIAAABjaGFubmVscwBjaGxpc3QANwAAAEIAAAAAAAAAAAABAAAAAQAAAEcAAQAAAAAAAAABAAAAAQAAAFIAAgAAAAAAAAABAAAAAQAAAABjb21wcmVzc2lvbgBjb21wcmVzc2lvbgABAAAABWRhdGFXaW5kb3cAYm94MmkAEAAAAAAAAAAAAAAADwAAAA8AAABkaXNwbGF5V2luZG93AGJveDJpABAAAAAAAAAAAAAAAA8AAAAPAAAAbGluZU9yZGVyAGxpbmVPcmRlcgABAAAAAHBpeGVsQXNwZWN0UmF0aW8AZmxvYXQABAAAAAAAgD9zY3JlZW5XaW5kb3dDZW50ZXIAdjJmAAgAAAAAAAAAAAAAAHNjcmVlbldpbmRvd1dpZHRoAGZsb2F0AAQAAAAAAIA/AEEBAAAAAAAAAAAAACkBAAB4XpXRyU3FQBAE0Bljlv5skmOwbxwQArNJ4GuTAjk4BscwPwVigBiIYWIgBw7/VNXStLqO03V4qknR7DDppu+6nHPm3nZIeqP3YdN5HMfhEEmaplr2RVU/VHWitptMHoezORwhzkh1Nx15btuchT0FOaLICe9zRJ67Nsd4KnJkRU54n548923O8k6nATmiyAnvc0yehzbHeGbkSEVOeJ8T8sxtjvF8IkdW5IT3OSXPY5tjPBtyJCEn7DkjzxMXkGM8BTlCnPB/ieMhjvF8IUcKcsL7EGf3zAXkGM83cqQiJ7zPueMhjvH8Ikcm5IT3uSDPCxeQYzwVObIiJ7zPpeMhjvH8IUd+kBPe54o8r1xAzrLwHTl9Qk7hupdrx8Mc9hCnJ87+HxSdtFk=";
function base64Fixture(encoded: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return bytes.buffer;
}
function pxrFixture(precision: Precision): ArrayBuffer {
  return base64Fixture(pxrFixtures[precision]);
}

// Authored using OpenEXR 3.4.6 OutputFile: 64 x 32 PIZ-compressed,
// R=float32 (x+y)/7, G=half (x+y)/16, B=uint32 x*10+y. The resulting
// independent EXR file is zlib-compressed only to keep this test source small.
const pizMixedFixture =
  "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";
function inflateFixture(encoded: string): ArrayBuffer {
  const bytes = inflateSync(Buffer.from(encoded, "base64"));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

// OpenEXR 3.4.6 exrmaketiled converted our none_half fixture to PXR24,
// ONE_LEVEL, ROUND_UP, using 13 x 11 tiles (including partial edge tiles).
const pxrTiledFixture =
  "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";

// OpenEXR 3.4.6 exrmultipart combined this suite's zip_half and zip_float
// fixtures as parts 0 and 1. Its second-part offset table was emitted as zeros;
// exact offsets were restored using the physical part/chunk headers before the
// resulting EXR file was compressed here for compact test-source storage.
const multipartFixture =
  "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";

// Independently authored with OpenEXR 3.4.6 DeepScanLineOutputFile.
// Pixels in increasing Y have p%4 samples; A=0.25/0.5/0.75, R=(p+1)/16,
// Z=sample+1 and UINT ID=p*100+sample. Outer zlib keeps source compact.
const deepFixtures: Record<string, string> = {
  "deep-0":
    "eNq10L1OwzAQB/BLoVAkBgYegAfgs2JADDRVWUB8SF0KTITEpRbBjmK3tFsGJB6EhYcAxAjvAIgRdh6AfxJXCQEEC6l+snW1787XW1iyShUit+MIwXyFjc+V" +
    "pk0iqpNF6WcZG+tEhVCTSoXIwZcIknbFSUN2hSYOowjFZ1x5GoRMKS7Fp31yx3O00+LCk2d0JPtVTlOUfeMms8dV4DuDX8/5XLDd0GNhbpdUCXif+XUVMFc3" +
    "Hc0ltX3ppB0SRTXlhoyJNH2DCY1rvWqbKrkS+SMt7ulOIYUeBIyUDrk4psm4ZcYC5ToibqTHwuTBw6EkLV2aqV+UsiIzZr0qrMMpj8CYEb95AuJitIzfSmI1" +
    "v/fw1z08wCwSzME8vMMe6u7DNdzAbdrHGpFtRDl38GJQLRMZZGerbf8Ut/7hjee48ApvsIXpbsMOTJeJ+jCAR3iC53IyZfSzaNg5hxAY0Tf+9sYPSYCHoQ==",
  "deep-1":
    "eNor0zdkZOJgYEjOSMzLS80pBjJyMotLGLwYGBgcGRgZIIARij1dGBjQhIIYmNBEojBEgIaW5mU755fmlTBkAjELUAikJjk/t6Aotbg4Mz8PhQ3Wl5JYkhie" +
    "mZeSX86QlF9hlMkgwIAA7FCTUzKLC3ISKwmqy8nMS/UvSkktQmKBXVaQWZGa41hckJpcEpRYkpnPkJaTnwhxIQNDg31xclFqah7EeOfUvBKgtjKjNAYOJCuQ" +
    "lYRnppRkoBlRUlmQylBcUpSZl87AA3JyampBcXJiHsghZalFYA/DAgXspMXQUM9gQlgiDKWnQekVUPoDQ0NjfXNtW1VbVXtlZ3lPCX/DfwauhhdPZDx2eG5f" +
    "E7I2eF1QSc8NjZvqNkdsD9sdYmr4c8DhgAMrwy+HAwkLEhawNjAz/GhoALqz4YADM8MbKLOkoaWmpakKTLqxNOxrrIfApjoYbNjnhA73O8LgAQcQBpFwNiOS" +
    "J2YS54mrLH8yZmROP2Ny1vic0ZScHxw/2WOWxC6OW9SwIGFDwIYAkA0HHB4ofBD4IMCJ7IulWHzhWdsMhEAWELZWI2ADwtWYEIs/AAxj+zg=",
  "deep-2":
    "eNor0zdkZOJgYEjOSMzLS80pBjJyMotLGLwYGBgcGRgZIIARij1dGBjQhIIYmNBEojBEgIaW5mU755fmlTBkAjELUAikJjk/t6Aotbg4Mz8PhQ3Sw5SSWJIY" +
    "npmXkl/OkJRfYZTJIMCAAOxQk1MyiwtyEisJqsvJzEv1L0pJLUJigV1WkFmRmuNYXJCaXBKUWJKZz5CWk58IcSEDQ4N9cXJRamoexHjn1LwSoLYyozQGDiQr" +
    "kJWEZ6aUZKAZUVJZkMpQXFKUmZfOwANycmpqQXFyYh7IIWWpRWAPwwIF7KTF0FC3Y0JYogCl46H0CiQHgJQzAzEbFIP8zAnEIMsq4pIzHBrUjeSsbbav54yU" +
    "3qO3YsnztmO+pbOVt7W/5WNcymchU5DAwNzOzMktJOZg0vBDQUil/4heZsbKzMxVTJPzElp7vwrcCGFv5v0958LDOncJmwcMhxSEzrExbLvhdZARyWkJ5DiN" +
    "YZq9pLHR8vmGltk15zK8zvH3zX9j6J0kflw3K2LCBsUE5wOM7AI1Cz44PmhmYJYxMWn4wMiuUubp7O3rHSw648uaXDYnBW6O6NWCGxL3K+dVHGBscVSZw8tw" +
    "j83rIACCYKGz",
  "deep-wide-0":
    "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" +
    "OC3ylUKcEUXayBp1ZPyVHf8L1BnkVw==",
  "deep-wide-1":
    "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",
  "deep-wide-2":
    "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"
};
function deepFixture(name: string): ArrayBuffer {
  return inflateFixture(deepFixtures[name]!);
}

// OpenEXR 3.4.6 OutputFile: 64 x 32. The lossless DWA fixtures have
// UINT A=100+y and R=x+y. The RGB fixture has FLOAT channels compressed
// using lossy DCT; 37 x 31 HDR and a tiled DEFLATE-AC file extend coverage.
const dwaFixtures: Record<string, string> = {
  "dwaa":
    "eNor0zdkZGJgYEjOSMzLS80pBjJyMotLGFSBYo4MMMAIxUEYIgzJ+bkFRanFxZn5eShskCRHSmJJYnhmXkp+OUNSfoVRJoMAAwLYA7E8EKdkFhfkJFYSVJeT" +
    "mZfqX5SSWoTEAjuhILMiNcexuCA1uSQosSQznyEtJz+xhIEFrLvBvji5KDU1D2K8c2peCVBbmVEaAweSFchKwjNTSjLQjGDQZ0QoTgOymWAcBQh1jgE7sILS" +
    "C9DU4wJswEDnYKi49fQ8cyMrAwPrhrm5t7fl3nb7L2F/IrrZUbArsCloykIZ0RUuoqsCm6OuLJTjzXARnnWxKWzLQlnZFy7iuy42x31ZKM8scUSgzbApsCdR" +
    "RnjGEZFlhs2RZxLluCOOCE3b2BS6JlFW+sYRsW0bm2PfJMqzP/x++MPvwB9/Lf7UCdXZ8+6f33r//OH34g+/n/7wO/THX6s/dcJ1+3n332+9//7we/6H349/" +
    "+B3846/ln39CdfW8+/e33r9/+L38w+/nP/wO//HX+s8/4br/vPv/t97/H8gwz7FCoOLW1oOsjM1A320wj54p/e5dwByRnHt2++r+MS300Jl46gnXUq+1F199" +
    "YVt8MmfjrTd8y7OrbX+zrXqopwgAtmvPGA==",
  "dwab":
    "eNor0zdkZGJgYEjOSMzLS80pBjJyMotLGFSBYo4MMMAIxUEYIgzJ+bkFRanFxZn5eShskCRnSmJJYnhmXkp+OUNSfoVRJoMAAwLYA7E8EKdkFhfkJFYSVJeT" +
    "mZfqX5SSWoTEAjuhILMiNcexuCA1uSQosSQznyEtJz+xhIEFrLvBvji5KDU1D2K8c2peCVBbmVEaAweSFchKwjNTSjLQjGDQZ0QoTgOymWAcBQh1jgE7sILS" +
    "C9DU4wJswEDnYKi49fQ8cyMrAwPrhrm5t7fl3nb7L2F/IrrZUbArsCloykIZ0RUuoqsCm6OuLJTjzXARnnWxKWzLQlnZFy7iuy42x31ZKM8scUSgzbApsCdR" +
    "RnjGEZFlhs2RZxLluCOOCE3b2BS6JlFW+sYRsW0bm2PfJMqzP/x++MPvwB9/Lf7UCdXZ8+6f33r//OH34g+/n/7wO/THX6s/dcJ1+3n332+9//7we/6H349/" +
    "+B3846/ln39CdfW8+/e33r9/+L38w+/nP/wO//HX+s8/4br/vPv/t97/H8gwz7FCoOLW1oOsjM1A320wj54p/e5dwByRnHt2++r+MS300Jl46gnXUq+1F199" +
    "YVt8MmfjrTd8y7OrbX+zrXqopwgAuKvPGQ==",
  "dwaa-rgb":
    "eNrNUmtUU1cWvkSwIQrIS0CnvDVgrAhVg44QEBSSiliKYgcEAgmYkhcQJDDLCYo8FIEaQK04xAcUAcutSEElGgiYCioqUqBV4iMBysiiCRh5hWTOTejUqTNr" +
    "fk7PWmc/vv3tfc653z3o4WmAgiAo/gCZyaTSU0FAp6VyICLA/CGkgiyDhb3tPSToPSTsPQSKZzHYKdTUVBqL+W8xUkRTyBxyBI1JYaVDcSyuFw1aBv22CGA7" +
    "gE2hpbLp5Iz/yaPTmNTQFAo15Z1IdwU2jUul+6eyqfGcMDKHxoIS6CwyBzLUdWcRUuNTqFSmfnwAlckBbQe9EiD0O0e8S4mgUTgHfjcC+szgN/Id0ImC/vM6" +
    "84HeX13ILRZ81q8ER71DG+l97O/6LcAntkIFQa6obdAGlD+E1h1kqoWg3EUQNOqgZ1lq/+vSXOfp/UWRzs/mAuMP9iOelDQvF2iCtXJYs31eDkuJ8/JiKUh5" +
    "3SSNnCcNAtg4SY2kalANRihBGjncTdRSYAlIBRIwAJYglD6imsJDIlBQd8CtIBKANldYTNJUwl2ginRQ4J9I84FwB0lNEYiJaleBmKSA24LVhsgQQwFGARoV" +
    "8BMEaCXNUwAgAJOQRKudQQmxCgshTiwywil6RGScVis/Pn8CfkBSH4XvkNSB4CjwqiPH3c5jxmDkaO0fci1IdXlBlQs8RAkNSSuP0QRp5cWICdUrAQxLq33j" +
    "MsknbHaZ4vM2Yyf5PDusciHaDAqizQ5ziFHwRe5IwQ6r4POMXZR8gh0wPGPcBGIU+oLIGKfUDyAYYyf4IjscgjlM/oui1GM8dyw4zQCnsEAGWCARn/c5Yoxx" +
    "KtChOwPcQER00Q1V6DALkSd2FkQu+vTXCMjUh1FvgNsQHd+QQAS06i3WSQ00akXUQxKiTmZgXgSDf0VKVCAoRr0UqLgFKxaCy4iQe4iawRtEi3Cv9D+zVu2G" +
    "8sPpy5a4/4ecsmUGaKvkOds4P9vzK4L923dKdjzIza4c2dAgSYitTcxYfCtNfDeW+HF0GeboEa9AYzPp+Kh10fi4eio9gZd6boTQ+dD7r2biMLtH8rkXCtfa" +
    "xNC6HaFLjM38oq3RG4mPHSTJX1yrzb4+mCz0XNwV0rx+OS2qFmOYNB1tdmR7ZtnP+XuqPm8ozFuJXrWzYvr+pSgd9VuvVfik20QaBiFGmn3K/DLT2TpxL/0S" +
    "WUxG1XALZWtOrDGVpUmy7pc+NRfa6Hl7zcwZtYSLThFrHpTSvYMdrT1Wzp7V8brbt0UpRRcac4xQG9Us08eM+lln65QrP+5oPxovrn7S20venb6y3jO3snPQ" +
    "x6TSzc0cfhm4ZbvweeC2nHK3AXY+N3w2Uz9JAg2c6Rv9meHk71fIwxh0fTQ862y1FgwqCVKFVtdcFp8fx0dFm3QWMitye6ys0P3Ky97b5xXJmOXg7u2Ob8rw" +
    "CR4hF2so1fvs24SOh++R/Dwt17+tnth6L69VOPOXkw8HekNCr1RUVSZ3ZBC7rA5tKvt7rMzPzQDfyColTccsKYbDbhV07Y3CFhvj8fblpKFYmfvqkG9W3j1J" +
    "6PKnqXrM4ibSTtt9zynvYO2sXJ/8pW3pRAXPUo3Lyev7wWFA2HXvRHZDiIwHauyipV3poYRjGm+jxL7+QwX3r1wXpxNnM6lO2QUves8ObtVgp5/t9hU+j7e6" +
    "LlwolBxLSeKoHhMkPYdVw3O2VZ15HEH112G23jdNszKQgpgdfmhuLO700vj6F6VxUx/vWVv6Go6VtrpBzEX1qu8IJ4ejfHMcTWr+NJ8T4q4q6W0swhcVrctx" +
    "SN3S3SKBPN/2h/q8zHKLzCwbsw9rkO0bfjUse9Z9Y7/M+EPKuGCdDSqtOdgnu7MvalXRLg/zW/dfSj2OLMFyZpLvVjQNF4/ZU6mdsoICiWaY/QsWhVsx6Psp" +
    "TnbYh/Hd89hJ3Lr1H5475ANadrquTeLMBMKFbV5PH7w1/6SkqNu3AnQsb9v4lQ6vHGouH3M+bbNrAT+8R49ThkS3xe7sDnxPR4lNmTK84bP6W9lcQ9SeJpTN" +
    "nAq8jTT9N3Qf0LA/vEcQIa2qZH+ND+tAFZdNXKtXHjgOhUSyItvRgQ0qXP/WqhjZ7qeflBfjhlJa7jz6aGbQh7XkAuZepf0N+T+0drsahTsmmgKEUS6+faNy" +
    "3+Uoo9MbeFGTa7S23Y1C1hA9j9u0+Hbf6IgwefWVppbXFdSYl1b06iddN0yVtPIZzqTU6lidB74/UIs14cxmRDhJl939ZahpUrqpZG80q/6YZp1JuB7OmpoY" +
    "mZDt8702BcgQN3rulEQ1Pj70pGVK5CNMGzxeVcCNdhi4eXCmJ6c5xn5AeHCGnzNi5Dx2xnLo6FcRdmvdbtj0z/CuUorEJ/LzBwSMxJuvVqw4Je89a38uXsHo" +
    "T67/s13LpRTTU0L8swTzEcVtpvi1mW+aBaqw0KTQxNFQgsZ0ccU/9vSiwyfrmvhXv6mpUfICGAzrgEjLpIBD+/czfuAxV+ern5/FfLs1lcFgrNpdcc0U/UWd" +
    "xgDaZR0Hc3+qS7xcvXTTsqy3007Qw+9xV/8JR1BCnQ=="
,
  "dwab-rgb":
    "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" +
    "38P1PwPNiQSI",
  "tiled-dwaa-rgb":
    "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" +
    "UUhvyyOwclYbigdNfFECXnG0iv8E2ETAsQ==",
  "variant0":
    "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"
};
function dwaFixture(name: string): ArrayBuffer {
  return inflateFixture(dwaFixtures[name]!);
}

// OpenEXR 3.4.6 independently wrote and read back 16 x 10 B44/B44A.
// Its decoded scanline bytes are stored alongside each EXR. Channels in file
// order are FLOAT A, pLinear HALF B, UINT G, and HALF R; y=8..9 form partial
// 4x4 blocks. The outer zlib layer only keeps this source compact.
const b44Fixtures: Record<string, string> = {
  "b44-exr":
    "eNrt1VdTE1EYxvGXVRE79q7BSmwUe0GavYGgYpeQLGYxbGJ2DWBFbBh7x1gnFxnJjDNeOF7lwo/iR/F/NkEiNyresrO/zSnvOZvZzD6JFJXkaCLi9XtMUw9Y" +
    "NAKGZctuxipFzagjJ6PqV6vPTpEBNXXONXtEvMHWUFi3LCNo/tZWk7k+j+1pMExfsE2agu2lhuRL/zEBo+AzrFDA0/HHuoBh6jVhnx7OajlfIWS064FKK6R7" +
    "7TqPbQSlORD02DLcWd1ZbnnDum6mt6/WTZtlkdJmycu6RXZJg+Gz/QO2kPqc/uLaXGewjMtWkQp04iO+4wekXCQfLhSjArVoRKjc2XBo/dD6/1ifEi1aGI+6" +
    "41F/PFaYKtAyTXci6k9VaerTiMf8iZg7pWuqaSTU2fIPld1arDeRNJKxlkSsl8oeV4JbOtNUdrv6Kg0qmUsmk+neZ+2TSzWdAfWmjMYUzEMhSrEFO9S7hOMq" +
    "A2CiHV24j5eZiBmDqZgPN1ajLBNPB3ECOoLowA08wCuokBuLaXBhGdakH7zscgJN5CSaVYzgIm7iIXowDOMwHQVYjrXpH8iJ0XqcwlmcxyXcwiO8hgqQ8ZiB" +
    "BViBdajAHhzCafgRxmXcxmPEMCKTfzOxECux3olvkb04jDNQD9rCFdzBE7xRCQyVpbOwCKuwwQl7kX04gka0wMZVdOMp3mIkJmI2FqMIG1GN/WiAB+dwAddw" +
    "F8/wDipkJ2EOlqAYm7ANB3AUTSrbEVGpiiie430m9ydjLpaiBJuxHTU4pv6B0Io2XMc9vMAHfBEtz9XVd/597+sge98G2fsJBQxIBQ==",
  "b44-raw":
    "eNq91ddOFFEAx+FjASuCvSv2ggoouLDsKoq9Yu+KvSt2UdQVFHvv3UfR+CI+gfHSBM36LdyPJiSbk+9y/vNLJicTQioZQpgTQjUpPvOF74S5IRRQSAnV1FJH" +
    "PSl+Ff0s/lGaX5Zb/rs8L5aOtVT8qWiqzIk3xFvjjVU2Qk8GMIrJzCTBImrZyj5OcJEm7vMy83DJP04H+6PrW6s6GenFQEYzhVlkXrqYNWxjPydpoJkHvMpC" +
    "f3R9MtHZSG8GUchUytpfGJawlu0coJ5L3OAhr7PQH13fnOhiJI/BjKGI8vbhsJR17OAgp7jMTR7xJgv90fVfE12N9GEIY5nGbKpZxnp2cojTNNLCY96Gto8V" +
    "fTrYH12fTuQYyWco45hOjHksZwO7OMwZrnCLJ7zLQn90fU0y10gBwxjPDCqYzwo2UscRznKV2zzlfRb6o+tTyW5G+jKcCRRTSQ0r2cRujnKOa9zhGR+y0B9d" +
    "/y3Z3Ug/RjCx7TqGEGcBq9jMHo5xnhR3ec7H0HZZok8H+6Pr08keRvozkkmUkvmpLWQ1W9jLcS5wnXu84NN/9P8FJFkzJA==",
  "b44a-exr":
    "eNrt1VdTE1EYxvGXKPaCvWuwEhvFXpBmbyCo2CUki1kMuzG7UqzYMfaOa51cZCQzznjheJULP4Afwg/ihf+zCRC5cRxv2Tm/zZtz3rOb2UyetBYW53hEJBDy" +
    "G4YWtijCumXLLuYqRK2oIyejsq/qtUNkQE+te86ekYDZEolqlqWbxh+1Whwe9Nv+et0Imm3SaLaX6JIn/cd4jERQtyJhf8df+8K6oVVHg1o0q3I/QkRv18IV" +
    "VkQL2LV+WzelKWz6bRnq7u4sswJRTTPSl6/SDJttrSVNMiLrFtkt9XrQDg24hNTl9Df/yHUnSzltESlHJz7iO35CykTy4EURylGDBkTK3AsO7h/c/x/7U+KJ" +
    "FcRjvngsFHcKUvmeTOlLxEKpSo961eNOKOH4UppHlXpCjeZ/6OzyOD2JpJ50mhNOD53d3gS3dJfp7PL2dup0spZMJtPvPns+eVXpTqhfyihMxlwUoASbsR01" +
    "OKYyAAbacR338TITMaMxBfPgwyqUZuLpAI5Dg4kO3MADvIIKuTGYCi+WYnX6wctON9BETqBJxQgu4CYeohtDMBbTkI9lWJP+gtwYrcNJnME5XMQtPMJrqAAZ" +
    "h+mYj+VYi3LsxkGcQghRXMJtPIaD3Ez+zcACrMA6N75F9uAQTkM9aAuXcQdP8AbDoLJ0JhZiJda7YS+yF4fRgGbYuIIuPMVbleCYgFlYhEJsQBX2oR5+nMV5" +
    "XMVdPMM7qJCdiNlYjCJsxFbsxxE0qmxHq0pVxPAc7zO5PwlzsATF2IRtqMZR9Q+EFrThGu7hBT7gi/zqG1+zxres8Rt3djpx",
  "b44a-raw":
    "eNq91ddOFFEAx+FjASuCvSv2ggoouLDsKoq9Yu+KvSt2UdQVFHvv3UfR+CI+gfHSBM36LdyPJiSbk+9y/vNLJicTQioZQpgTQjUpPvOF74S5IRRQSAnV1FJH" +
    "PSl+Ff0s/lGaX5Zb/rs8L5aOtVT8qWiqzIk3xFvjjVU2Qk8GMIrJzCTBImrZyj5OcJEm7vMy83DJP04H+6PrW6s6GenFQEYzhVlkXrqYNWxjPydpoJkHvMpC" +
    "f3R9MtHZSG8GUchUytpfGJawlu0coJ5L3OAhr7PQH13fnOhiJI/BjKGI8vbhsJR17OAgp7jMTR7xJgv90fVfE12N9GEIY5nGbKpZxnp2cojTNNLCY96Gto8V" +
    "fTrYH12fTuQYyWco45hOjHksZwO7OMwZrnCLJ7zLQn90fU0y10gBwxjPDCqYzwo2UscRznKV2zzlfRb6o+tTyW5G+jKcCRRTSQ0r2cRujnKOa9zhGR+y0B9d" +
    "/y3Z3Ug/RjCx7TqGEGcBq9jMHo5xnhR3ec7H0HZZok8H+6Pr08keRvozkkmUkvmpLWQ1W9jLcS5wnXu84NN/9P8FJFkzJA=="
};
function b44Fixture(name: string): ArrayBuffer {
  return inflateFixture(b44Fixtures[name]!);
}

function fixture(name: string): ArrayBuffer {
  const bytes = readFileSync(new URL(`../../fixtures/exr/${name}.exr`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** Read only this suite's known, uncompressed scanline layout, not a general EXR parser. */
function uncompressedPixels(precision: Precision): Float32Array | Uint16Array {
  const buffer = fixture(`none_${precision}`);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  expect(view.getUint32(0, true)).toBe(20000630);
  let cursor = 8;
  const attributes = new Map<string, { type: string; start: number; size: number }>();
  const readCString = (): string => {
    const start = cursor;
    while (cursor < bytes.length && bytes[cursor] !== 0) cursor += 1;
    if (cursor === bytes.length) throw new Error("Unterminated fixture header");
    const value = new TextDecoder().decode(bytes.subarray(start, cursor));
    cursor += 1;
    return value;
  };
  while (bytes[cursor] !== 0) {
    const name = readCString();
    const type = readCString();
    const size = view.getUint32(cursor, true);
    cursor += 4;
    attributes.set(name, { type, start: cursor, size });
    cursor += size;
  }
  cursor += 1;
  const compression = attributes.get("compression")!;
  expect(compression.type).toBe("compression");
  expect(bytes[compression.start]).toBe(0);
  const window = attributes.get("dataWindow")!;
  expect(window.type).toBe("box2i");
  expect([0, 4, 8, 12].map((n) => view.getInt32(window.start + n, true))).toEqual([0, 0, WIDTH - 1, HEIGHT - 1]);
  const channelAttribute = attributes.get("channels")!;
  const channels: string[] = [];
  let channel = channelAttribute.start;
  while (bytes[channel] !== 0) {
    const end = bytes.indexOf(0, channel);
    channels.push(new TextDecoder().decode(bytes.subarray(channel, end)));
    const pixelType = view.getInt32(end + 1, true);
    expect(pixelType).toBe(precision === "half" ? 1 : 2);
    channel = end + 17;
  }
  expect(channels).toEqual(["A", "B", "G", "R"]);
  const stride = precision === "half" ? 2 : 4;
  const pixels = precision === "half" ? new Uint16Array(WIDTH * HEIGHT * 4) : new Float32Array(WIDTH * HEIGHT * 4);
  for (let tableY = 0; tableY < HEIGHT; tableY += 1) {
    const offset = Number(view.getBigUint64(cursor + tableY * 8, true));
    const y = view.getInt32(offset, true);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(HEIGHT);
    expect(view.getUint32(offset + 4, true)).toBe(WIDTH * 4 * stride);
    for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
      const destinationChannel = "RGBA".indexOf(channels[channelIndex]!);
      for (let x = 0; x < WIDTH; x += 1) {
        const position = offset + 8 + (channelIndex * WIDTH + x) * stride;
        pixels[((HEIGHT - 1 - y) * WIDTH + x) * 4 + destinationChannel] = precision === "half"
          ? view.getUint16(position, true)
          : view.getFloat32(position, true);
      }
    }
  }
  return pixels;
}

/** Locate a known attribute and the offset table for deliberately corrupt fixtures. */
function fixtureLayout(buffer: ArrayBuffer): { attributes: Map<string, number>; table: number } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const attributes = new Map<string, number>();
  let cursor = 8;
  const readString = (): string => {
    const start = cursor;
    while (cursor < bytes.length && bytes[cursor] !== 0) cursor += 1;
    if (cursor >= bytes.length) throw new Error("Unterminated fixture header");
    const result = new TextDecoder().decode(bytes.subarray(start, cursor));
    cursor += 1;
    return result;
  };
  while (bytes[cursor] !== 0) {
    const name = readString();
    readString();
    const size = view.getUint32(cursor, true);
    cursor += 4;
    attributes.set(name, cursor);
    cursor += size;
  }
  return { attributes, table: cursor + 1 };
}

/** Locate each header and its offset table in the known multipart fixture. */
function multipartLayout(buffer: ArrayBuffer): { attributes: Map<string, number>[]; tables: number[] } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let cursor = 8;
  const readString = (): string => {
    const start = cursor;
    while (cursor < bytes.length && bytes[cursor] !== 0) cursor += 1;
    if (cursor === bytes.length) throw new Error("Unterminated multipart fixture header");
    const value = new TextDecoder().decode(bytes.subarray(start, cursor));
    cursor += 1;
    return value;
  };
  const attributes: Map<string, number>[] = [];
  while (bytes[cursor] !== 0) {
    const part = new Map<string, number>();
    while (bytes[cursor] !== 0) {
      const name = readString();
      readString();
      const size = view.getUint32(cursor, true);
      cursor += 4;
      part.set(name, cursor);
      cursor += size;
    }
    cursor += 1;
    attributes.push(part);
  }
  cursor += 1;
  const tables = attributes.map((part) => {
    const start = cursor;
    cursor += view.getInt32(part.get("chunkCount")!, true) * 8;
    return start;
  });
  return { attributes, tables };
}

function halfToNumber(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 31;
  const fraction = bits & 1023;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

const halfReference = uncompressedPixels("half") as Uint16Array;
const floatReference = uncompressedPixels("float") as Float32Array;

function assertPixels(
  actual: Uint16Array | Float32Array,
  source: Uint16Array | Float32Array,
  output: Precision,
  channels: 1 | 2 | 4
): void {
  expect(actual.length).toBe(WIDTH * HEIGHT * channels);
  const errors: string[] = [];
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const actualValue = actual[pixel * channels + channel]!;
      const sourceValue = source[pixel * 4 + channel]!;
      const sourceFloat = source instanceof Uint16Array ? halfToNumber(sourceValue) : sourceValue;
      const actualFloat = output === "half" ? halfToNumber(actualValue) : actualValue;
      const equal = (source instanceof Uint16Array && output === "half") || (source instanceof Float32Array && output === "float")
        ? actualValue === sourceValue
        : Math.abs(actualFloat - sourceFloat) <= (output === "half" ? 0.001 : 0);
      if (!equal && errors.length < 8) errors.push(`pixel ${pixel} channel ${channel}: got ${actualFloat}, expected ${sourceFloat}`);
    }
  }
  expect(errors).toEqual([]);
}

describe("OpenEXR scanline decoding", () => {
  test("preserves alpha and negative values in Y/RY/BY conversion", async () => {
    // Authored with OpenEXR 3.4.6: Y=0.5, RY=-2, BY=1, A=0.25.
    const source = base64Fixture("di8xAQIAAABjaGFubmVscwBjaGxpc3QASwAAAEEAAgAAAAAAAAABAAAAAQAAAEJZAAIAAAAAAAAAAQAAAAEAAABSWQACAAAAAAAAAAEAAAABAAAAWQACAAAAAAAAAAEAAAABAAAAAGNvbXByZXNzaW9uAGNvbXByZXNzaW9uAAEAAAAAZGF0YVdpbmRvdwBib3gyaQAQAAAAAAAAAAAAAAAAAAAAAAAAAGRpc3BsYXlXaW5kb3cAYm94MmkAEAAAAAAAAAAAAAAAAAAAAAAAAABsaW5lT3JkZXIAbGluZU9yZGVyAAEAAAAAcGl4ZWxBc3BlY3RSYXRpbwBmbG9hdAAEAAAAAACAP3NjcmVlbldpbmRvd0NlbnRlcgB2MmYACAAAAAAAAAAAAAAAc2NyZWVuV2luZG93V2lkdGgAZmxvYXQABAAAAAAAgD8AVQEAAAAAAAAAAAAAEAAAAAAAgD4AAIA/AAAAwAAAAD8=");
    const float = await parseEXR(source, { type: "float" });
    expect(float.data[0]).toBe(-0.5);
    expect(float.data[1]).toBeCloseTo((0.5 + 0.5 * 0.2126 - 0.0722) / 0.7152, 5);
    expect(float.data[2]).toBe(1);
    expect(float.data[3]).toBe(0.25);
    const half = await parseEXR(source, { type: "half" });
    expect(halfToNumber(half.data[0]!)).toBe(-0.5);
    expect(halfToNumber(half.data[2]!)).toBe(1);
    expect(halfToNumber(half.data[3]!)).toBe(0.25);
    expect(halfToNumber(half.data[1]!)).toBeCloseTo(float.data[1]!, 3);
  });

  test("reports channels omitted by a narrower output layout", async () => {
    const decoded = await parseEXR(fixture("none_float"), { type: "float", outputFormat: "r" });
    expect(decoded.diagnostics).toEqual([
      { code: "EXR_CHANNEL_OMITTED", message: "Channel A is not represented in the output texture." },
      { code: "EXR_CHANNEL_OMITTED", message: "Channel B is not represented in the output texture." },
      { code: "EXR_CHANNEL_OMITTED", message: "Channel G is not represented in the output texture." }
    ]);
  });

  test("treats object-prototype names as omitted source channels", async () => {
    // OpenEXR 3.4.6: one R sample and an unrelated channel named toString.
    const source = base64Fixture("di8xAQIAAABjaGFubmVscwBjaGxpc3QALAAAAFIAAgAAAAAAAAABAAAAAQAAAHRvU3RyaW5nAAIAAAAAAAAAAQAAAAEAAAAAY29tcHJlc3Npb24AY29tcHJlc3Npb24AAQAAAABkYXRhV2luZG93AGJveDJpABAAAAAAAAAAAAAAAAAAAAAAAAAAZGlzcGxheVdpbmRvdwBib3gyaQAQAAAAAAAAAAAAAAAAAAAAAAAAAGxpbmVPcmRlcgBsaW5lT3JkZXIAAQAAAABwaXhlbEFzcGVjdFJhdGlvAGZsb2F0AAQAAAAAAIA/c2NyZWVuV2luZG93Q2VudGVyAHYyZgAIAAAAAAAAAAAAAABzY3JlZW5XaW5kb3dXaWR0aABmbG9hdAAEAAAAAACAPwA2AQAAAAAAAAAAAAAIAAAAAAAAPwAA4EA=");
    const decoded = await parseEXR(source, { type: "float" });
    expect(Array.from(decoded.data)).toEqual([0.5, 0, 0, 1]);
    expect(decoded.diagnostics).toEqual([{ code: "EXR_CHANNEL_OMITTED", message: "Channel toString is not represented in the output texture." }]);
  });

  test("the uncompressed reference fixtures contain their specified gradients", () => {
    for (const [x, y] of [[0, 0], [1, 1], [17, 13], [63, 0], [0, 47], [63, 47]]) {
      const offset = ((HEIGHT - 1 - y!) * WIDTH + x!) * 4;
      const expected = [2 * x! / 63, 1.5 * y! / 47, 0.25 + (x! + y!) / 110, 1];
      for (let channel = 0; channel < 4; channel += 1) {
        expect(floatReference[offset + channel]).toBeCloseTo(expected[channel]!, 5);
        expect(halfToNumber(halfReference[offset + channel]!)).toBeCloseTo(expected[channel]!, 3);
      }
    }
  });

  for (const precision of ["half", "float"] as const) {
    for (const compression of ["none", "rle", "zips", "zip", "piz"] as const) {
      for (const output of ["half", "float"] as const) {
        test(`${compression} ${precision} decodes all pixels to ${output}`, async () => {
          const decoded = await parseEXR(fixture(`${compression}_${precision}`), { type: output });
          expect(decoded).toMatchObject({ width: WIDTH, height: HEIGHT, channels: 4, type: output, format: "rgba", colorSpace: "linear", flipY: false, generateMipmaps: false });
          expect(decoded.data).toBeInstanceOf(output === "half" ? Uint16Array : Float32Array);
          assertPixels(decoded.data, precision === "half" ? halfReference : floatReference, output, 4);
        });
      }
    }
  }

  for (const precision of ["half", "float"] as const) {
    for (const output of ["half", "float"] as const) {
      test(`PXR24 ${precision} luminance decodes to ${output}`, async () => {
        const decoded = await parseEXR(pxrFixture(precision), { type: output, outputFormat: "rgba" });
        expect(decoded).toMatchObject({ width: 16, height: 16, channels: 4, format: "rgba" });
        expect(decoded.header.compression).toBe("PXR24_COMPRESSION");
        for (let y = 0; y < 16; y += 1) {
          for (let x = 0; x < 16; x += 1) {
            const offset = ((15 - y) * 16 + x) * 4;
            for (let channel = 0; channel < 4; channel += 1) {
              const raw = decoded.data[offset + channel]!;
              const actual = output === "half" ? halfToNumber(raw) : raw;
              expect(actual).toBe(channel === 3 ? 1 : (x + y) / 16);
            }
          }
        }
      });
    }
  }

  for (const output of ["half", "float"] as const) {
    test(`PXR24 mixed float, half and uint channels decode to ${output}`, async () => {
      const decoded = await parseEXR(base64Fixture(pxrMixedFixture), { type: output });
      expect(decoded).toMatchObject({ width: 16, height: 16, channels: 4, format: "rgba" });
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          const offset = ((15 - y) * 16 + x) * 4;
          const expected = [(x + y) / 7, (x + y) / 16, x * 10 + y, 1];
          for (let channel = 0; channel < 4; channel += 1) {
            const raw = decoded.data[offset + channel]!;
            const actual = output === "half" ? halfToNumber(raw) : raw;
            // PXR24 rounds away eight FLOAT mantissa bits. In this fixture's
            // [0, 30/7] range, its maximum rounding error is 2^-14; allow a
            // little extra for the original FLOAT representation of /7.
            const tolerance = channel === 0 ? (output === "half" ? 0.002 : 0.000062) : 0.00001;
            expect(Math.abs(actual - expected[channel]!), `x=${x}, y=${y}, channel=${channel}`).toBeLessThanOrEqual(tolerance);
          }
        }
      }
    });
  }

  for (const output of ["half", "float"] as const) {
    test(`PIZ mixed float, half and uint channels decode to ${output}`, async () => {
      const file = inflateFixture(pizMixedFixture);
      const view = new DataView(file);
      const { table } = fixtureLayout(file);
      const firstChunk = Number(view.getBigUint64(table, true));
      expect(view.getUint32(firstChunk + 4, true)).toBeLessThan(64 * 32 * 10);
      const decoded = await parseEXR(file, { type: output });
      expect(decoded).toMatchObject({ width: 64, height: 32, channels: 4, format: "rgba" });
      expect(decoded.header.compression).toBe("PIZ_COMPRESSION");
      for (let y = 0; y < 32; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          const offset = ((31 - y) * 64 + x) * 4;
          const expected = [Math.fround((x + y) / 7), (x + y) / 16, x * 10 + y, 1];
          for (let channel = 0; channel < 4; channel += 1) {
            const raw = decoded.data[offset + channel]!;
            const actual = output === "half" ? halfToNumber(raw) : raw;
            const tolerance = output === "half" && channel === 0 ? 0.004 : 0;
            expect(Math.abs(actual - expected[channel]!), `x=${x}, y=${y}, channel=${channel}`).toBeLessThanOrEqual(tolerance);
          }
        }
      }
    });
  }

  for (const output of ["half", "float"] as const) {
    test(`decodes every PXR24 tiled pixel including edge tiles to ${output}`, async () => {
      const decoded = await parseEXR(inflateFixture(pxrTiledFixture), { type: output });
      expect(decoded).toMatchObject({ width: WIDTH, height: HEIGHT, channels: 4, format: "rgba" });
      expect(decoded.header.compression).toBe("PXR24_COMPRESSION");
      assertPixels(decoded.data, halfReference, output, 4);
    });
  }

  test("rejects a multilevel tile descriptor with an inconsistent chunk table", async () => {
    const file = inflateFixture(pxrTiledFixture);
    const { attributes } = fixtureLayout(file);
    const tileMode = attributes.get("tiles")! + 8;
    new Uint8Array(file)[tileMode] = 0x11; // ROUND_UP, MIPMAP_LEVELS
    await expect(parseEXR(file)).rejects.toThrow(/chunk|offset|table|truncated/i);
  });

  test("rejects a truncated PXR24 compressed chunk", async () => {
    const data = pxrFixture("float");
    await expect(parseEXR(data.slice(0, data.byteLength - 2))).rejects.toThrow();
  });

  test.each([
    ["PXR24", () => pxrFixture("float"), 16 * 16 * 3],
    ["ZIP", () => fixture("zip_float"), WIDTH * 16 * 4 * 4]
  ] as const)("bounds %s inflated data to the declared channel layout", async (_method, makeFile, expectedBytes) => {
    for (const extra of [-1, 1]) {
      const file = makeFile();
      const { table } = fixtureLayout(file);
      const view = new DataView(file);
      const chunk = Number(view.getBigUint64(table, true));
      const malformed = deflateSync(new Uint8Array(expectedBytes + extra));
      expect(malformed.length).toBeLessThan(view.getUint32(chunk + 4, true));
      view.setUint32(chunk + 4, malformed.length, true);
      new Uint8Array(file).set(malformed, chunk + 8);
      await expect(parseEXR(file)).rejects.toThrow(/exceed|size|length|buffer/i);
    }
  });

  test("rejects truncated PIZ payload even when trailing bytes remain in the file", async () => {
    const data = fixture("piz_half");
    const view = new DataView(data);
    const { table } = fixtureLayout(data);
    const lastChunk = Number(view.getBigUint64(table + 8, true));
    const size = view.getUint32(lastChunk + 4, true);
    view.setUint32(lastChunk + 4, size - 8, true);
    await expect(parseEXR(data)).rejects.toThrow();
  });

  test.each([
    ["r", 1],
    ["rg", 2],
    ["rgba", 4]
  ] as const)("selects %s output channels from RGB data", async (format, channels) => {
    const decoded = await parseEXR(fixture("zip_float"), { type: "float", outputFormat: format });
    expect(decoded.format).toBe(format);
    expect(decoded.channels).toBe(channels);
    assertPixels(decoded.data, floatReference, "float", channels);
  });

  test("reads decreasing-Y chunks through the offset table", async () => {
    const file = fixture("none_float");
    const layout = fixtureLayout(file);
    const input = new Uint8Array(file.slice(0));
    const output = new Uint8Array(file);
    const view = new DataView(file);
    const originalView = new DataView(input.buffer);
    const offsets = Array.from({ length: HEIGHT }, (_, index) => Number(originalView.getBigUint64(layout.table + index * 8, true)));
    const blockBytes = 8 + WIDTH * 4 * 4;
    output[layout.attributes.get("lineOrder")!] = 1;
    for (let row = 0; row < HEIGHT; row += 1) {
      const destination = offsets[HEIGHT - 1 - row]!;
      output.set(input.subarray(offsets[row]!, offsets[row]! + blockBytes), destination);
      view.setBigUint64(layout.table + row * 8, BigInt(destination), true);
    }
    const decoded = await parseEXR(file, { type: "float" });
    assertPixels(decoded.data, floatReference, "float", 4);
  });

  test("rounds FLOAT channels to binary16, including exponent carry, ties and special values", async () => {
    const file = fixture("none_float");
    const view = new DataView(file);
    const { table } = fixtureLayout(file);
    const firstChunk = Number(view.getBigUint64(table, true));
    // The independently read fixture channel order is A, B, G, R.
    const redStart = firstChunk + 8 + 3 * WIDTH * 4;
    const cases: readonly (readonly [number, number])[] = [
      [1.9999, 0x4000],
      [65504, 0x7bff],
      [65520, 0x7c00],
      [-65520, 0xfc00],
      [-0, 0x8000],
      [1 + 2 ** -11, 0x3c00],
      [1 + 3 * 2 ** -11, 0x3c02],
      [2 ** -25, 0x0000],
      [3 * 2 ** -25, 0x0002],
      [-(2 ** -25), 0x8000],
      [2 ** -14 - 2 ** -25, 0x0400]
    ];
    for (const [x, [value]] of cases.entries()) view.setFloat32(redStart + x * 4, value, true);
    view.setFloat32(redStart + cases.length * 4, NaN, true);
    const decoded = await parseEXR(file, { type: "half" });
    const firstScanline = (HEIGHT - 1) * WIDTH * 4;
    for (const [x, [, expected]] of cases.entries()) {
      expect(decoded.data[firstScanline + x * 4], `case ${x}`).toBe(expected);
    }
    const nanBits = decoded.data[firstScanline + cases.length * 4]!;
    expect(nanBits & 0x7c00).toBe(0x7c00);
    expect(nanBits & 0x03ff).not.toBe(0);
  });

  for (const part of [0, 1] as const) {
    for (const output of ["half", "float"] as const) {
      test(`selects multipart scanline part ${part} and decodes to ${output}`, async () => {
        const decoded = await parseEXR(inflateFixture(multipartFixture), { part, type: output });
        expect(decoded).toMatchObject({ width: WIDTH, height: HEIGHT, channels: 4, format: "rgba" });
        assertPixels(decoded.data, part === 0 ? halfReference : floatReference, output, 4);
      });
    }
  }

  test("rejects an out-of-range multipart index", async () => {
    await expect(parseEXR(inflateFixture(multipartFixture), { part: 2 })).rejects.toThrow(/part|range/i);
  });

  // OpenEXR 3.4.6 exrmaketiled/exrmultipart combined our independently
  // generated 64 x 48 gradients into tiled PXR24, scanline ZIP and tiled ZIP
  // parts. PXR24 and ZIP use 13 x 11 and 17 x 9 tiles, respectively. The last
  // part's empty writer-produced offset table was populated independently from
  // its chunk coordinates; the resulting three parts were read by OpenEXR.
  for (const part of [0, 1, 2] as const) {
    for (const output of ["half", "float"] as const) {
      test(`decodes mixed multipart tiled/scanline part ${part} to ${output}`, async () => {
        const file = fixture("multipart_tiled");
        const { tables } = multipartLayout(file);
        const view = new DataView(file);
        const chunk = Number(view.getBigUint64(tables[part]!, true));
        expect(view.getInt32(chunk, true)).toBe(part);
        if (part === 0) expect(view.getUint32(chunk + 20, true)).toBeLessThan(13 * 11 * 8);
        if (part === 2) expect(view.getUint32(chunk + 20, true)).toBeLessThan(17 * 9 * 16);
        const decoded = await parseEXR(file, { part, type: output });
        expect(decoded.header.type).toBe(part === 1 ? "scanlineimage" : "tiledimage");
        expect(decoded.header.compression).toBe(part === 0 ? "PXR24_COMPRESSION" : "ZIP_COMPRESSION");
        expect(decoded.header.spec).toMatchObject({ singleTile: false, multiPart: true });
        assertPixels(decoded.data, part === 0 ? halfReference : floatReference, output, 4);
      });
    }
  }

  test("validates every multipart tile's owner, coordinates, header and bounds", async () => {
    const source = fixture("multipart_tiled");
    const { attributes, tables } = multipartLayout(source);
    const first = Number(new DataView(source).getBigUint64(tables[0]!, true));

    const wrongOwner = source.slice(0);
    new DataView(wrongOwner).setInt32(first, 1, true);
    await expect(parseEXR(wrongOwner, { part: 1 })).rejects.toThrow(/different part/i);

    const duplicate = source.slice(0);
    const duplicateView = new DataView(duplicate);
    const second = Number(duplicateView.getBigUint64(tables[0]! + 8, true));
    duplicateView.setInt32(second + 4, 0, true);
    duplicateView.setInt32(second + 8, 0, true);
    await expect(parseEXR(duplicate)).rejects.toThrow(/duplicate.*chunk/i);

    const badCoordinate = source.slice(0);
    new DataView(badCoordinate).setInt32(first + 4, 5, true);
    await expect(parseEXR(badCoordinate)).rejects.toThrow(/tile coordinates/i);

    const badLevel = source.slice(0);
    new DataView(badLevel).setInt32(first + 12, 1, true);
    await expect(parseEXR(badLevel)).rejects.toThrow(/tile coordinates|level/i);

    const badSize = source.slice(0);
    new DataView(badSize).setUint32(first + 20, 13 * 11 * 8 + 1, true);
    await expect(parseEXR(badSize)).rejects.toThrow(/chunk/i);

    const invalidLevels = source.slice(0);
    new Uint8Array(invalidLevels)[attributes[0]!.get("tiles")! + 8] = 0x11;
    await expect(parseEXR(invalidLevels)).rejects.toThrow(/chunk count/i);

    const unknownPart = source.slice(0);
    new Uint8Array(unknownPart)[attributes[0]!.get("type")!] = "x".charCodeAt(0);
    await expect(parseEXR(unknownPart)).rejects.toThrow(/unsupported|type/i);

    const truncated = source.slice(0);
    new DataView(truncated).setBigUint64(tables[0]!, BigInt(source.byteLength - 23), true);
    await expect(parseEXR(truncated)).rejects.toThrow(/chunk offset/i);
  });

  test("EXRLoader setters control parsing", async () => {
    const loader = new EXRLoader().setDataType("float").setOutputFormat("rg").setPart(0);
    const decoded = await loader.parse(fixture("rle_float"));
    expect(decoded).toMatchObject({ channels: 2, type: "float", format: "rg", colorSpace: "linear", flipY: false, generateMipmaps: false });
    assertPixels(decoded.data, floatReference, "float", 2);
  });

  test("preserves the named compression and channel metadata", async () => {
    const decoded = await parseEXR(fixture("piz_half"));
    expect(decoded.header.compression).toBe("PIZ_COMPRESSION");
    expect((decoded.header.channels as unknown[]).length).toBe(4);
  });

  test("rejects bad magic, unterminated headers and truncated data", async () => {
    await expect(parseEXR(new ArrayBuffer(32))).rejects.toThrow(/EXR/i);
    const file = fixture("none_float");
    await expect(parseEXR(file.slice(0, 10))).rejects.toThrow();
    await expect(parseEXR(file.slice(0, file.byteLength - 8))).rejects.toThrow();
  });

  test("rejects invalid dimensions, unknown compression and corrupt chunk locations", async () => {
    const hugeWindow = fixture("none_float");
    const layout = fixtureLayout(hugeWindow);
    new DataView(hugeWindow).setInt32(layout.attributes.get("dataWindow")! + 8, 0x7fffffff, true);
    await expect(parseEXR(hugeWindow)).rejects.toThrow();

    const unknownCompression = fixture("none_float");
    new Uint8Array(unknownCompression)[layout.attributes.get("compression")!] = 255;
    await expect(parseEXR(unknownCompression)).rejects.toThrow();

    const badOffset = fixture("none_float");
    new DataView(badOffset).setBigUint64(layout.table, BigInt(badOffset.byteLength + 8), true);
    await expect(parseEXR(badOffset)).rejects.toThrow();

    const badChunkLength = fixture("none_float");
    const chunkOffset = Number(new DataView(badChunkLength).getBigUint64(layout.table, true));
    new DataView(badChunkLength).setUint32(chunkOffset + 4, 0x7fffffff, true);
    await expect(parseEXR(badChunkLength)).rejects.toThrow();
  });

  test.each([[10, "HTJ2K256"], [11, "HTJ2K32"]] as const)("reports unsupported %s compression by name", async (code, name) => {
    const file = fixture("none_float");
    const { attributes } = fixtureLayout(file);
    new Uint8Array(file)[attributes.get("compression")!] = code;
    await expect(parseEXR(file)).rejects.toThrow(new RegExp(`${name}.*unsupported`, "i"));
  });

  test("enforces caller input and pixel limits", async () => {
    const file = fixture("none_half");
    await expect(parseEXR(file, { maxInputBytes: file.byteLength - 1 })).rejects.toThrow(/limit|size|exceed/i);
    await expect(parseEXR(file, { maxPixels: WIDTH * HEIGHT - 1 })).rejects.toThrow(/limit|pixel|exceed/i);
    await expect(parseEXR(file, { maxInputBytes: file.byteLength, maxPixels: WIDTH * HEIGHT })).resolves.toMatchObject({ width: WIDTH, height: HEIGHT });
    await expect(parseEXR(file, { maxInputBytes: 0 })).rejects.toThrow();
    await expect(parseEXR(file, { maxPixels: Infinity })).rejects.toThrow();
  });

  test("validates requested part and output options", async () => {
    const file = fixture("none_half");
    await expect(parseEXR(file, { part: -1 })).rejects.toThrow();
    await expect(parseEXR(file, { part: 0.5 })).rejects.toThrow();
    await expect(parseEXR(file, { part: 1 })).rejects.toThrow();
    await expect(parseEXR(file, { type: "invalid" as Precision })).rejects.toThrow();
    await expect(parseEXR(file, { outputFormat: "invalid" as "r" })).rejects.toThrow();
  });
});


/** Isolate part zero from the known multipart fixture as a single tiled image. */
function singleTiledFixture(source: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(source), view = new DataView(source);
  const { attributes, table: headerEnd } = fixtureLayout(source);
  const { tables } = multipartLayout(source);
  const count = view.getInt32(attributes.get("chunkCount")!, true);
  const chunks = Array.from({ length: count }, (_, index) => {
    const start = Number(view.getBigUint64(tables[0]! + index * 8, true));
    const size = view.getUint32(start + 20, true);
    return bytes.subarray(start + 4, start + 24 + size);
  });
  const output = new Uint8Array(headerEnd + count * 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  output.set(bytes.subarray(0, headerEnd));
  const result = new DataView(output.buffer);
  result.setUint32(4, 0x202, true);
  let cursor = headerEnd + count * 8;
  for (const [index, chunk] of chunks.entries()) {
    result.setBigUint64(headerEnd + index * 8, BigInt(cursor), true);
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output.buffer;
}

describe("OpenEXR tiled resolution levels", () => {
  // Independently authored using the OpenEXR file layout, then read by
  // OpenEXR 3.4.6. The parts are ZIP tiled ROUND_UP, raw scanline, ZIP tiled
  // ROUND_DOWN, with a (-4, 3) data-window origin and different analytic
  // FLOAT pixels at every level. Tiles at odd edges are deliberately partial.
  for (const [mode, width, height] of [["mipmap", 13, 7], ["ripmap", 11, 7]] as const) {
    for (const part of [0, 2] as const) {
      for (const output of ["half", "float"] as const) {
        test(`decodes all ${mode} levels of part ${part} to ${output}`, async () => {
          const file = fixture(`${mode}_levels`);
          const up = part === 0;
          const rounding = up ? Math.ceil : Math.floor;
          const xCount = rounding(Math.log2(mode === "mipmap" ? Math.max(width, height) : width)) + 1;
          const yCount = mode === "mipmap" ? xCount : rounding(Math.log2(height)) + 1;
          for (let ly = 0; ly < yCount; ly += 1) for (let lx = 0; lx < xCount; lx += 1) {
            if (mode === "mipmap" && lx !== ly) continue;
            const w = Math.max(1, rounding(width / 2 ** lx));
            const h = Math.max(1, rounding(height / 2 ** ly));
            const decoded = await parseEXR(file, { part, type: output, level: { x: lx, y: ly } });
            expect(decoded).toMatchObject({ width: w, height: h, channels: 4, type: output });
            expect(decoded.header.tiles).toMatchObject({ levelMode: `${mode.toUpperCase()}_LEVELS`, roundingMode: up ? "ROUND_UP" : "ROUND_DOWN" });
            expect(decoded.header.dataWindow).toEqual({ xMin: -4, yMin: 3, xMax: width - 5, yMax: height + 2 });
            const errors: string[] = [];
            for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
              const expected = [part * 8 + lx + ly / 2 + x / 16 + y / 32, -part - lx / 4 + y / 16, ly + x / 32 + y / 64, 0.5];
              const offset = ((h - 1 - y) * w + x) * 4;
              for (let channel = 0; channel < 4; channel += 1) {
                const encoded = decoded.data[offset + channel]!;
                const actual = output === "half" ? halfToNumber(encoded) : encoded;
                if (Math.abs(actual - expected[channel]!) > (output === "half" ? 0.015625 : 0) && errors.length < 8) {
                  errors.push(`level ${lx},${ly} pixel ${x},${y} channel ${channel}: ${actual} != ${expected[channel]}`);
                }
              }
            }
            expect(errors).toEqual([]);
          }
        });
      }
    }
  }

  test.each(["mipmap", "ripmap"] as const)("reads %s levels from a single-part tiled file", async (mode) => {
    const single = singleTiledFixture(fixture(`${mode}_levels`));
    const decoded = await parseEXR(single, { type: "float", level: { x: 2, y: mode === "mipmap" ? 2 : 1 } });
    expect(decoded).toMatchObject({ width: mode === "mipmap" ? 4 : 3, height: mode === "mipmap" ? 2 : 4 });
    expect(decoded.header.spec).toMatchObject({ singleTile: true, multiPart: false });
    expect(decoded.data[(decoded.height - 1) * decoded.width * 4]).toBe(mode === "mipmap" ? 3 : 2.5);
  });

  test("selects a level through the loader's parse and fetch APIs", async () => {
    const file = fixture("ripmap_levels");
    const loader = new EXRLoader().setDataType("float").setPart(2).setLevel(2, 1);
    const parsed = await loader.parse(file);
    expect(parsed).toMatchObject({ width: 2, height: 3 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(file.slice(0))));
    const loaded = await loader.load("https://assets.example/ripmap.exr");
    expect(loaded.data).toEqual(parsed.data);
    const diagonal = await new EXRLoader().setDataType("float").setLevel(2).parse(fixture("mipmap_levels"));
    expect(diagonal).toMatchObject({ width: 4, height: 2 });
  });

  test("rejects malformed, out-of-range and incompatible level selections", async () => {
    const mip = fixture("mipmap_levels"), rip = fixture("ripmap_levels");
    for (const level of [{ x: -1, y: 0 }, { x: 1.5, y: 0 }, { x: 0, y: Infinity }, null, { x: 1 }] as unknown[]) {
      await expect(parseEXR(rip, { level: level as { x: number; y: number } })).rejects.toThrow(/level/i);
    }
    await expect(parseEXR(mip, { level: { x: 1, y: 0 } })).rejects.toThrow(/level/i);
    await expect(parseEXR(mip, { part: 2, level: { x: 4, y: 4 } })).rejects.toThrow(/level/i);
    await expect(parseEXR(rip, { part: 2, level: { x: 0, y: 3 } })).rejects.toThrow(/level/i);
    await expect(parseEXR(rip, { part: 1, level: { x: 1, y: 0 } })).rejects.toThrow(/level/i);
    await expect(parseEXR(fixture("none_float"), { level: { x: 1, y: 1 } })).rejects.toThrow(/level/i);
  });

  test("validates tile levels and chunk tables even when another part is selected", async () => {
    const source = fixture("ripmap_levels");
    const { attributes, tables } = multipartLayout(source);
    const view = new DataView(source);
    const count = view.getInt32(attributes[0]!.get("chunkCount")!, true);
    const last = Number(view.getBigUint64(tables[0]! + (count - 1) * 8, true));

    const badLevel = source.slice(0);
    new DataView(badLevel).setInt32(last + 12, 100, true);
    await expect(parseEXR(badLevel, { part: 1 })).rejects.toThrow(/level|tile coordinates/i);

    const badMode = source.slice(0);
    new Uint8Array(badMode)[attributes[0]!.get("tiles")! + 8] = 0x13;
    await expect(parseEXR(badMode, { part: 1 })).rejects.toThrow(/tile|mode/i);

    const badCount = source.slice(0);
    new DataView(badCount).setInt32(attributes[0]!.get("chunkCount")!, count - 1, true);
    await expect(parseEXR(badCount, { part: 1 })).rejects.toThrow(/chunk count/i);
  });
});


describe("OpenEXR subsampled scanline channels", () => {
  // Independently authored NONE source has A/HALF 1x1, B/HALF 2x2,
  // G/FLOAT 3x3, omitted ID/UINT 2x3, and R/FLOAT 1x1 in a (-6,-6) 48x66
  // window. The sampling grids cross the 16- and 32-line block boundaries.
  // OpenEXR 3.4.6 converted that same source to each compression in the
  // multipart fixture; its final missing offset table was reconstructed from
  // its chunk headers. OpenEXR read every part and independently decoded the
  // samples. Missing pixels are reconstructed by nearest sample, with ties
  // toward the higher coordinate and edge clamping.
  const methods = ["rle", "zips", "zip", "piz", "pxr24", "b44", "b44a", "dwaa", "dwab"] as const;
  const nearest = (coord: number, low: number, high: number, sampling: number) => {
    const first = Math.ceil(low / sampling) * sampling, last = Math.floor(high / sampling) * sampling;
    return Math.max(first, Math.min(last, Math.floor(coord / sampling + 0.5) * sampling));
  };
  for (const output of ["half", "float"] as const) {
    for (const [part, method] of [[-1, "none"], ...methods.map((method, index) => [index, method] as const)] as const) {
      test(`${method} preserves sample positions and nearest reconstruction to ${output}`, async () => {
        const file = fixture(part < 0 ? "subsampled_source" : "subsampled_codecs");
        if (part >= 0) {
          const { tables } = multipartLayout(file);
          const view = new DataView(file), chunk = Number(view.getBigUint64(tables[part]!, true));
          const rows = part <= 1 ? 1 : part === 2 || part === 4 ? 16 : part === 8 ? 66 : 32;
          const raw = Array.from({ length: rows }, (_, y) => 288 + (y % 2 === 0 ? 48 : 0) + (y % 3 === 0 ? 160 : 0)).reduce((a, b) => a + b, 0);
          expect(view.getUint32(chunk + 8, true), `${method} is actually compressed`).toBeLessThan(raw);
        }
        const decoded = await parseEXR(file, { part: Math.max(0, part), type: output });
        expect(decoded).toMatchObject({ width: 48, height: 66, channels: 4, type: output });
        const errors: string[] = [];
        for (let y = -6; y < 60; y += 1) for (let x = -6; x < 42; x += 1) {
          const bx = nearest(x, -6, 41, 2), by = nearest(y, -6, 59, 2);
          const gx = nearest(x, -6, 41, 3), gy = nearest(y, -6, 59, 3);
          const expected = [0.125 + (x + 6) / 32 + (y + 6) / 64, 1.25 + (gx + 6) / 64 + (gy + 6) / 128, 0.5 + (bx + 6) / 32 + (by + 6) / 64, 0.75];
          const offset = ((59 - y) * 48 + x + 6) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            const raw = decoded.data[offset + channel]!;
            const actual = output === "half" ? halfToNumber(raw) : raw;
            const tolerance = part >= 7 ? 0.012 : output === "half" ? 0.001 : 0;
            if (Math.abs(actual - expected[channel]!) > tolerance && errors.length < 8) errors.push(`pixel ${x},${y}, channel ${channel}: ${actual} != ${expected[channel]}`);
          }
        }
        expect(errors).toEqual([]);
      });
    }
  }

  test("reconstructs subsampled chroma before converting every pixel to RGB", async () => {
    const decoded = await parseEXR(fixture("subsampled_chroma"), { type: "float" });
    expect(decoded).toMatchObject({ width: 20, height: 12, channels: 4 });
    for (let y = 2; y < 14; y += 1) for (let x = -4; x < 16; x += 1) {
      const sx = nearest(x, -4, 15, 2), sy = nearest(y, 2, 13, 2);
      const luminance = 0.5 + (x + 4) / 64 + (y - 2) / 64;
      const red = luminance * (1.5 + (sx + 4) / 32);
      const blue = luminance * (0.75 + (sy - 2) / 32);
      const green = (luminance - red * 0.2126 - blue * 0.0722) / 0.7152;
      const offset = ((13 - y) * 20 + x + 4) * 4;
      expect(decoded.data[offset]).toBeCloseTo(red, 6);
      expect(decoded.data[offset + 1]).toBeCloseTo(green, 6);
      expect(decoded.data[offset + 2]).toBeCloseTo(blue, 6);
      expect(decoded.data[offset + 3]).toBe(0.75);
    }
  });

  test.each([0, 1] as const)("reconstructs subsampled DWA RGB color transforms in part %s", async (part) => {
    // OpenEXR 3.4.6 encoded analytic HALF RGB 2x2 and A 1x1 channels as
    // DWAA/DWAB. Matching RGB sample grids use a joint color transform.
    const file = fixture("subsampled_dwa_rgb"), { tables } = multipartLayout(file), view = new DataView(file);
    const chunk = Number(view.getBigUint64(tables[part]!, true));
    expect(view.getUint32(chunk + 8, true)).toBeLessThan(32 * 32 * 2 + 16 * 16 * 6);
    const decoded = await parseEXR(file, { part, type: "float" });
    for (let y = -4; y < 28; y++) for (let x = -4; x < 28; x++) {
      const sx = nearest(x, -4, 27, 2), sy = nearest(y, -4, 27, 2);
      const expected = [0.125 + (sx + 4) / 64, 0.25 + (sy + 4) / 64, 0.375 + (sx + sy + 8) / 128, 1];
      const offset = ((27 - y) * 32 + x + 4) * 4;
      for (let channel = 0; channel < 4; channel++) expect(Math.abs(decoded.data[offset + channel]! - expected[channel]!)).toBeLessThan(0.012);
    }
  });

  test("accepts scanline chunks with no stored samples", async () => {
    // Independent 6x4 R/FLOAT 2x2 image at (-2,-2), with a zero-byte chunk
    // on each unsampled row. OpenEXR 3.4.6 also read this fixture.
    const file = base64Fixture("di8xAQIAAABjaGFubmVscwBjaGxpc3QAEwAAAFIAAgAAAAAAAAACAAAAAgAAAABjb21wcmVzc2lvbgBjb21wcmVzc2lvbgABAAAAAGRhdGFXaW5kb3cAYm94MmkAEAAAAP7////+////AwAAAAEAAABkaXNwbGF5V2luZG93AGJveDJpABAAAAD+/////v///wMAAAABAAAAbGluZU9yZGVyAGxpbmVPcmRlcgABAAAAAHBpeGVsQXNwZWN0UmF0aW8AZmxvYXQABAAAAAAAgD9zY3JlZW5XaW5kb3dDZW50ZXIAdjJmAAgAAAAAAAAAAAAAAHNjcmVlbldpbmRvd1dpZHRoAGZsb2F0AAQAAAAAAIA/ADUBAAAAAAAASQEAAAAAAABRAQAAAAAAAGUBAAAAAAAA/v///wwAAAAAAAAAAAAAQAAAgED/////AAAAAAAAAAAMAAAAAAAAQAAAgEAAAMBAAQAAAAAAAAA=");
    const { table } = fixtureLayout(file), view = new DataView(file);
    const empty = Number(view.getBigUint64(table + 8, true));
    expect(view.getUint32(empty + 4, true)).toBe(0);
    const decoded = await parseEXR(file, { type: "float", outputFormat: "r" });
    const expected = [
      2, 4, 4, 6, 6, 6,
      2, 4, 4, 6, 6, 6,
      2, 4, 4, 6, 6, 6,
      0, 2, 2, 4, 4, 4
    ];
    expect(Array.from(decoded.data)).toEqual(expected);
    const uint = file.slice(0), uintView = new DataView(uint);
    uintView.setInt32(fixtureLayout(uint).attributes.get("channels")! + 2, 0, true);
    for (const row of [0, 2]) {
      const start = Number(uintView.getBigUint64(table + row * 8, true)) + 8;
      for (let x = 0; x < 3; x++) uintView.setUint32(start + x * 4, uintView.getFloat32(start + x * 4, true), true);
    }
    const uintFloat = await parseEXR(uint, { type: "float", outputFormat: "r" });
    const uintHalf = await parseEXR(uint, { type: "half", outputFormat: "r" });
    expect(Array.from(uintFloat.data)).toEqual(expected);
    expect(Array.from(uintHalf.data, halfToNumber)).toEqual(expected);
  });

  test("limits ZIP inflation to the sampled byte count, not the full pixel grid", async () => {
    const file = fixture("subsampled_chroma");
    const { table } = fixtureLayout(file), view = new DataView(file);
    const chunk = Number(view.getBigUint64(table, true));
    const sampledBytes = 20 * 12 * 6 + 10 * 6 * 4;
    const oversized = deflateSync(new Uint8Array(sampledBytes + 1));
    expect(oversized.length).toBeLessThan(view.getUint32(chunk + 4, true));
    view.setUint32(chunk + 4, oversized.length, true);
    new Uint8Array(file).set(oversized, chunk + 8);
    await expect(parseEXR(file)).rejects.toThrow(/exceed|size|length|buffer/i);
  });

  test("skips unrepresented sampled channels and rejects invalid sampling or tiled sampling", async () => {
    const source = fixture("subsampled_source");
    const red = await parseEXR(source, { type: "float", outputFormat: "r" });
    expect(red.data[0]).toBe(0.125 + 65 / 64);
    expect(red.diagnostics.map(item => item.message)).toEqual(expect.arrayContaining([expect.stringContaining("B"), expect.stringContaining("G")]));
    const { attributes } = fixtureLayout(source);
    const firstChannel = attributes.get("channels")!;
    const invalid = source.slice(0);
    new DataView(invalid).setInt32(firstChannel + 2 + 8, 0, true);
    await expect(parseEXR(invalid)).rejects.toThrow(/sampling/i);
    const tiled = singleTiledFixture(fixture("mipmap_levels"));
    const layout = fixtureLayout(tiled);
    new DataView(tiled).setInt32(layout.attributes.get("channels")! + 2 + 8, 2, true);
    await expect(parseEXR(tiled)).rejects.toThrow(/tiled.*sampl|sampl.*tiled/i);
  });
});


describe("OpenEXR channel layers and chromaticities", () => {
  // Independent ZIP fixtures use analytic channel values, nested layer names,
  // an adversarial object-prototype name, UTF-8 names and subsampled chroma.
  // OpenEXR 3.4.6 read both files. The custom xy coordinates in the chroma
  // fixture yield exact luminance weights [0.25, 0.5, 0.25].
  for (const output of ["half", "float"] as const) {
    for (const layer of ["", "beauty", "beauty.specular", "__proto__", "彩色", "gray"] as const) {
      test(`selects ${layer || "root"} channels to ${output}`, async () => {
        const decoded = await parseEXR(fixture("layered_channels"), { layer, type: output });
        expect(decoded).toMatchObject({ width: 8, height: 4, channels: 4, type: output });
        for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
          const gray = 0.25 + (x + y) / 16;
          const expected = layer === "" ? [0.125 + x / 8, 0.25 + y / 8, 0.375, 0.75]
            : layer === "beauty" ? [1 + x / 8, 2 + y / 8, 3 + (x + y) / 16, 0.5]
            : layer === "beauty.specular" ? [-1 - x / 4, 0.75, 1.5 + y / 4, 1]
            : layer === "__proto__" ? [4 + x / 4, 5 + y / 4, 6, 1]
            : layer === "彩色" ? [7 + x / 4, 8 + y / 4, 9, 1]
            : [gray, gray, gray, 1];
          const base = ((3 - y) * 8 + x) * 4;
          for (let c = 0; c < 4; c++) {
            const raw = decoded.data[base + c]!;
            expect(output === "half" ? halfToNumber(raw) : raw).toBe(expected[c]);
          }
        }
        expect(decoded.diagnostics.some(item => item.message.includes("misc.Z"))).toBe(true);
        expect(decoded.diagnostics.some(item => item.message.includes(layer === "" ? "Channel R " : `Channel ${layer}.${layer === "gray" ? "Y" : "R"} `))).toBe(false);
      });
    }
  }

  test("preserves narrow output and loader parse/fetch layer selection", async () => {
    const file = fixture("layered_channels");
    const loader = new EXRLoader().setDataType("float").setOutputFormat("rg").setLayer("beauty.specular");
    const parsed = await loader.parse(file);
    expect(parsed).toMatchObject({ width: 8, height: 4, channels: 2, format: "rg" });
    expect(Array.from(parsed.data.slice(0, 4))).toEqual([-1, 0.75, -1.25, 0.75]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(file.slice(0))));
    const loaded = await loader.load("https://assets.example/layered.exr");
    expect(loaded.data).toEqual(parsed.data);
    const reset = await loader.setLayer("").setOutputFormat("r").parse(file);
    expect(reset.data[0]).toBe(0.125);
  });

  test("combines named layers, multipart selection and tiled mip levels", async () => {
    // OpenEXR 3.4.6 made mip tiles from the layered source and combined them
    // with its scanline part; offsets were reconstructed from chunk headers.
    const file = fixture("layered_levels");
    const base = await parseEXR(file, { part: 0, layer: "beauty.specular", type: "float" });
    const tiled = await parseEXR(file, { part: 1, layer: "beauty.specular", type: "float" });
    expect(tiled.data).toEqual(base.data);
    const mip = await new EXRLoader().setDataType("float").setPart(1).setLayer("beauty.specular").setLevel(1).parse(file);
    expect(mip).toMatchObject({ width: 4, height: 2, channels: 4 });
    for (let i = 0; i < mip.data.length; i += 4) {
      expect(mip.data[i + 1]).toBe(0.75);
      expect(mip.data[i + 3]).toBe(1);
    }
  });

  test.each(["half", "float"] as const)("uses custom primaries for subsampled layered chroma to %s", async (output) => {
    const decoded = await parseEXR(fixture("layered_chroma"), { layer: "paint.fill", type: output });
    expect(decoded).toMatchObject({ width: 8, height: 4, channels: 4, type: output });
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
      const sx = Math.min(6, Math.floor((x + 1) / 2) * 2), sy = Math.min(2, Math.floor((y + 1) / 2) * 2);
      const luminance = 0.5 + x / 16 + y / 32, ry = 0.5 + sx / 16, by = -0.5 + sy / 16;
      const red = (1 + ry) * luminance, blue = (1 + by) * luminance;
      const expected = [red, (luminance - red * 0.25 - blue * 0.25) / 0.5, blue, 0.75];
      const base = ((3 - y) * 8 + x) * 4;
      for (let c = 0; c < 4; c++) {
        const raw = decoded.data[base + c]!, actual = output === "half" ? halfToNumber(raw) : raw;
        expect(Math.abs(actual - expected[c]!)).toBeLessThanOrEqual(output === "half" ? 0.001 : 0);
      }
    }
  });

  test("rejects nonexistent layers and invalid selection values without falling back", async () => {
    const file = fixture("layered_channels");
    await expect(parseEXR(file, { layer: "missing" })).rejects.toThrow(/layer.*missing/i);
    await expect(parseEXR(file, { layer: "misc" })).rejects.toThrow(/representable/i);
    await expect(parseEXR(fixture("layered_chroma"))).rejects.toThrow(/root layer/i);
    for (const layer of [null, 42, "bad\0name", "a".repeat(256)] as unknown[]) {
      await expect(parseEXR(file, { layer: layer as string })).rejects.toThrow(/layer/i);
    }
  });

  test("rejects nonfinite, singular and invalid-type chromaticities before conversion", async () => {
    const file = fixture("layered_chroma"), start = fixtureLayout(file).attributes.get("chromaticities")!;
    const nonfinite = file.slice(0); new DataView(nonfinite).setFloat32(start, NaN, true);
    await expect(parseEXR(nonfinite, { layer: "paint.fill" })).rejects.toThrow(/chromaticities/i);
    const zeroY = file.slice(0); new DataView(zeroY).setFloat32(start + 4, 0, true);
    await expect(parseEXR(zeroY, { layer: "paint.fill" })).rejects.toThrow(/chromaticities/i);
    const singular = file.slice(0), singularView = new DataView(singular);
    singularView.setFloat32(start + 8, 0.5, true); singularView.setFloat32(start + 12, 0.25, true);
    await expect(parseEXR(singular, { layer: "paint.fill" })).rejects.toThrow(/chromaticities/i);
    const zeroGreen = file.slice(0), zeroGreenView = new DataView(zeroGreen);
    zeroGreenView.setFloat32(start + 24, 0.5, true); zeroGreenView.setFloat32(start + 28, 0.25, true);
    await expect(parseEXR(zeroGreen, { layer: "paint.fill" })).rejects.toThrow(/chromaticities/i);
    const wrongType = file.slice(0); new Uint8Array(wrongType)[start - 4 - 15] = "x".charCodeAt(0);
    await expect(parseEXR(wrongType, { layer: "paint.fill" })).rejects.toThrow(/chromaticities/i);
  });
});


describe("EXRLoader transport", () => {
  test("forwards request policy, integrity and streaming progress", async () => {
    const file = fixture("none_half");
    const digest = createHash("sha256").update(new Uint8Array(file)).digest("hex");
    const mockFetch = vi.fn(async () => new Response(file.slice(0), {
      headers: { "content-type": "image/x-exr", "content-length": String(file.byteLength) }
    }));
    vi.stubGlobal("fetch", mockFetch);
    const events: AssetLoadProgress[] = [];
    const context = new LoadContext({
      baseUrl: "https://assets.example/lighting/",
      sourceOrigin: "https://app.example",
      allowedOrigins: ["https://assets.example"],
      credentials: "include",
      cache: "no-cache"
    });
    const result = await new EXRLoader().load({
      url: "studio.exr",
      headers: { "x-resource-token": "sample" },
      priority: "high",
      maxBytes: file.byteLength,
      integrity: { version: 1, digest },
      onProgress: (event) => events.push(event)
    }, context);
    expect(result).toMatchObject({ width: WIDTH, height: HEIGHT });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit & { priority?: string }];
    expect(url).toBe("https://assets.example/lighting/studio.exr");
    expect(init).toMatchObject({ credentials: "include", cache: "no-cache", priority: "high", redirect: "error" });
    expect(new Headers(init.headers).get("x-resource-token")).toBe("sample");
    expect(events.some((event) => event.phase === "document" && event.loadedBytes === file.byteLength)).toBe(true);
    expect(events.at(-1)).toMatchObject({ url, phase: "complete", loadedBytes: file.byteLength, totalBytes: file.byteLength });

    await expect(new EXRLoader().load({ url: "studio.exr", maxBytes: file.byteLength - 1 }, context)).rejects.toThrow(/maxBytes|exceed/i);
    await expect(new EXRLoader().load({ url: "studio.exr", integrity: { version: 1, digest: "0".repeat(64) } }, context)).rejects.toThrow(/integrity|SHA-256/i);
  });

  test.each(["request", "context"] as const)("aborts the underlying request when the %s signal is cancelled", async (which) => {
    let fetchedSignal: AbortSignal | undefined;
    const mockFetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      fetchedSignal = init.signal ?? undefined;
      fetchedSignal?.addEventListener("abort", () => reject(fetchedSignal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", mockFetch);
    const requestController = new AbortController();
    const contextController = new AbortController();
    const context = new LoadContext({ baseUrl: "https://assets.example/", signal: contextController.signal });
    const pending = new EXRLoader().load({ url: "studio.exr", signal: requestController.signal }, context);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    (which === "request" ? requestController : contextController).abort(new Error("cancelled by test"));
    await expect(pending).rejects.toThrow(/cancelled|abort/i);
    expect(fetchedSignal?.aborted).toBe(true);
  });
});


describe("OpenEXR deep scanlines", () => {
  test("directs deep images to the bounded single-part deep API", async () => {
    await expect(parseEXR(deepFixture("deep-0"))).rejects.toThrow(/parseDeepEXR/i);
  });

  for (const [label, width] of [["deep", 8], ["deep-wide", 128]] as const) {
    for (const [method, code] of [["none", 0], ["rle", 1], ["zips", 2]] as const) {
      test(`${label} ${method} preserves offsets, HALF, FLOAT and UINT samples`, async () => {
        const file = deepFixture(`${label}-${code}`);
        const { table } = fixtureLayout(file);
        const view = new DataView(file);
        // The wide fixture verifies that both counts and sample values were
        // compressed on disk; a raw fallback would not exercise the codec.
        if (label === "deep-wide" && code !== 0) {
          const chunk = Number(view.getBigUint64(table, true));
          expect(Number(view.getBigUint64(chunk + 4, true))).toBeLessThan(width * 4);
          expect(Number(view.getBigUint64(chunk + 12, true))).toBeLessThan(Number(view.getBigUint64(chunk + 20, true)));
        }
        const result = await parseDeepEXR(file);
        expect(result).toMatchObject({ width, height: 2, compression: method, dataWindow: { xMin: 0, yMin: 0, xMax: width - 1, yMax: 1 } });
        expect(result.offsets).toBeInstanceOf(Uint32Array);
        expect(result.offsets.length).toBe(width * 2 + 1);
        expect(result.offsets[0]).toBe(0);
        expect(result.offsets.at(-1)).toBe(width === 8 ? 24 : 384);
        expect(result.channels.A.pixelType).toBe("half");
        expect(result.channels.A.values).toBeInstanceOf(Uint16Array);
        expect(result.channels.R.pixelType).toBe("float");
        expect(result.channels.R.values).toBeInstanceOf(Float32Array);
        expect(result.channels.Z.pixelType).toBe("float");
        expect(result.channels.ID.pixelType).toBe("uint");
        expect(result.channels.ID.values).toBeInstanceOf(Uint32Array);
        for (let pixel = 0; pixel < width * 2; pixel += 1) {
          const begin = result.offsets[pixel]!;
          expect(result.offsets[pixel + 1]! - begin).toBe(pixel % 4);
          for (let sample = 0; sample < pixel % 4; sample += 1) {
            const i = begin + sample;
            expect(result.channels.A.values[i]).toBe([0x3400, 0x3800, 0x3a00][sample]);
            expect(result.channels.R.values[i]).toBe((pixel + 1) / 16);
            expect(result.channels.Z.values[i]).toBe(sample + 1);
            expect(result.channels.ID.values[i]).toBe(pixel * 100 + sample);
          }
        }
      });
    }
  }

  test("enforces file, pixel, total sample, per-pixel and decoded-byte limits", async () => {
    const file = deepFixture("deep-0");
    await expect(parseDeepEXR(file, { maxInputBytes: file.byteLength - 1 })).rejects.toThrow(/limit/i);
    await expect(parseDeepEXR(file, { maxPixels: 15 })).rejects.toThrow(/limit|window/i);
    await expect(parseDeepEXR(file, { maxSamples: 23 })).rejects.toThrow(/limit|sample/i);
    await expect(parseDeepEXR(file, { maxSamplesPerPixel: 2 })).rejects.toThrow(/limit|sample/i);
    await expect(parseDeepEXR(file, { maxSampleBytes: 335 })).rejects.toThrow(/limit|sample/i);
    await expect(parseDeepEXR(file, { maxInputBytes: file.byteLength, maxPixels: 16, maxSamples: 24, maxSamplesPerPixel: 3, maxSampleBytes: 336 })).resolves.toMatchObject({ width: 8, height: 2 });
  });

  test("rejects bad deep offsets, non-monotonic counts, overflow and unsupported compression", async () => {
    const original = deepFixture("deep-0");
    const { table, attributes } = fixtureLayout(original);
    const chunk = Number(new DataView(original).getBigUint64(table, true));
    await expect(parseDeepEXR(original.slice(0, 10))).rejects.toThrow();
    const badOffset = original.slice(0);
    new DataView(badOffset).setBigUint64(table, BigInt(badOffset.byteLength + 1), true);
    await expect(parseDeepEXR(badOffset)).rejects.toThrow();
    const duplicate = original.slice(0);
    new DataView(duplicate).setBigUint64(table + 8, BigInt(chunk), true);
    await expect(parseDeepEXR(duplicate)).rejects.toThrow();
    const counts = original.slice(0);
    new DataView(counts).setUint32(chunk + 28 + 8, 0, true);
    await expect(parseDeepEXR(counts)).rejects.toThrow();
    const size = original.slice(0);
    new DataView(size).setBigUint64(chunk + 20, 0xffffffffffffffffn, true);
    await expect(parseDeepEXR(size)).rejects.toThrow();
    const compression = original.slice(0);
    new Uint8Array(compression)[attributes.get("compression")!] = 4;
    await expect(parseDeepEXR(compression)).rejects.toThrow(/compression/i);
  });

  test("rejects a compressed sample-count block that inflates beyond its bound", async () => {
    const file = deepFixture("deep-wide-2");
    const { table } = fixtureLayout(file);
    const view = new DataView(file);
    const first = Number(view.getBigUint64(table, true));
    const oversized = deflateSync(new Uint8Array(513)); // 128 counts may occupy only 512 bytes.
    view.setBigUint64(first + 4, BigInt(oversized.byteLength), true);
    new Uint8Array(file).set(oversized, first + 28);
    await expect(parseDeepEXR(file)).rejects.toThrow(/exceeds|larger|size/i);
  });

  test("composites depth-sorted point samples and rejects unsupported volumes", async () => {
    const decoded = await parseDeepEXR(deepFixture("deep-0"));
    const sample = decoded.offsets[3]!;
    const channels = { ...decoded.channels,
      R: { ...decoded.channels.R, values: new Float32Array(decoded.channels.R.values) },
      Z: { ...decoded.channels.Z, values: new Float32Array(decoded.channels.Z.values) }
    };
    (channels.R.values as Float32Array).set([0.1, 0.2, 0.3], sample);
    (channels.Z.values as Float32Array).set([3, 1, 2], sample);
    const image = compositeDeepEXR({ ...decoded, channels });
    const base = ((decoded.height - 1) * decoded.width + 3) * 4;
    expect(image[base]).toBeCloseTo(0.2 + 0.5 * 0.3 + 0.5 * 0.25 * 0.1, 6);
    expect(image[base + 3]).toBeCloseTo(0.5 + 0.5 * 0.75 + 0.5 * 0.25 * 0.25, 6);
    expect([...image.slice((decoded.height - 1) * decoded.width * 4, (decoded.height - 1) * decoded.width * 4 + 4)]).toEqual([0, 0, 0, 0]);
    const noDepth = { ...channels }; delete (noDepth as Partial<typeof noDepth>).Z;
    expect(() => compositeDeepEXR({ ...decoded, channels: noDepth })).toThrow(/Z channel/i);
    const zBack = { pixelType: "float" as const, values: new Float32Array(decoded.offsets.at(-1)!).fill(100) };
    expect(() => compositeDeepEXR({ ...decoded, channels: { ...channels, ZBack: zBack } })).toThrow(/volume sample/i);
  });
});


describe("OpenEXR multipart and tiled deep data", () => {
  // Independently authored from the OpenEXR byte layout. Counts vary per
  // pixel; HALF A, UINT ID and FLOAT R/Z vary by part, level and sample.
  // OpenEXR 3.4.6 reads the multipart fixture; its tools report that they do
  // not read multilevel deep tiles. The published format describes deep ZIP,
  // but OpenEXR 3.4.6 rejects that compression in its header validation.
  function checkSamples(decoded: Awaited<ReturnType<typeof parseDeepEXR>>, width: number, height: number, part: number, lx: number, ly: number): void {
    expect(decoded).toMatchObject({ width, height, dataWindow: { xMin: -2, yMin: 3, xMax: width - 3, yMax: height + 2 } });
    expect(decoded.offsets.length).toBe(width * height + 1);
    let total = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const count = (x + y + lx + ly + part) % 3, pixel = y * width + x;
      expect(decoded.offsets[pixel]).toBe(total);
      expect(decoded.offsets[pixel + 1]! - decoded.offsets[pixel]!).toBe(count);
      for (let sample = 0; sample < count; sample++) {
        const index = total + sample;
        expect(halfToNumber(decoded.channels.A.values[index]!)).toBe((sample + 1) / 4);
        expect(decoded.channels.ID.values[index]).toBe(part * 100000 + lx * 10000 + ly * 1000 + y * 100 + x * 3 + sample);
        expect(decoded.channels.R.values[index]).toBe(part + lx / 2 + ly / 4 + x / 16 + y / 32 + sample / 8);
        expect(decoded.channels.Z.values[index]).toBe(sample + 1);
      }
      total += count;
    }
    expect(decoded.offsets.at(-1)).toBe(total);
  }

  test("reads both scanline and tiled deep parts from a mixed multipart file", async () => {
    const file = fixture("deep_multipart");
    const flat = await parseEXR(file, { part: 0, type: "float", outputFormat: "r" });
    expect(flat).toMatchObject({ width: 7, height: 5, channels: 1 });
    for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) expect(flat.data[(4 - y) * 7 + x]).toBe(x / 16 + y / 32);
    expect(flat.header.spec).toMatchObject({ deepFormat: true, multiPart: true });
    await expect(parseEXR(file, { part: 1 })).rejects.toThrow(/parseDeepEXR/i);
    const scanline = await parseDeepEXR(file, { part: 1 }), tiled = await parseDeepEXR(file, { part: 2 });
    expect(scanline.compression).toBe("rle"); expect(tiled.compression).toBe("zips");
    checkSamples(scanline, 7, 5, 1, 0, 0);
    checkSamples(tiled, 7, 5, 2, 0, 0);
    expect(compositeDeepEXR(tiled).length).toBe(7 * 5 * 4);
    await expect(parseDeepEXR(file, { part: 0 })).rejects.toThrow(/not deep/i);
    await expect(parseDeepEXR(file, { part: 3 })).rejects.toThrow(/part.*range/i);
  });

  test("reads OpenEXR-written padded count tables on partial edge tiles", async () => {
    // OpenEXR 3.4.6 read the multipart tiled part and re-encoded it as NONE;
    // its edge count table uses the full 3x2 tile stride, including padding.
    const file = fixture("deep_tiled_padded"), { table } = fixtureLayout(file), view = new DataView(file);
    const edge = Number(view.getBigUint64(table + 2 * 8, true));
    expect(Number(view.getBigUint64(edge + 16, true))).toBe(3 * 2 * 4);
    const decoded = await parseDeepEXR(file);
    checkSamples(decoded, 7, 5, 2, 0, 0);
  });

  test("reads documented ZIP deep scanline blocks across a 16-row boundary", async () => {
    const file = fixture("deep_zip"), { tables } = multipartLayout(file), view = new DataView(file);
    const first = Number(view.getBigUint64(tables[0]!, true));
    expect(Number(view.getBigUint64(first + 8, true))).toBeLessThan(7 * 16 * 4);
    expect(Number(view.getBigUint64(first + 16, true))).toBeLessThan(Number(view.getBigUint64(first + 24, true)));
    const decoded = await parseDeepEXR(file, { part: 0 });
    expect(decoded.compression).toBe("zip");
    checkSamples(decoded, 7, 19, 0, 0, 0);
    const tiled = await parseDeepEXR(file, { part: 1 });
    expect(tiled.compression).toBe("zip");
    checkSamples(tiled, 7, 19, 1, 0, 0);
  });

  test("reads every mip level, including an empty-sample edge tile", async () => {
    const file = fixture("deep_tiled_mipmap");
    for (let level = 0; level < 4; level++) {
      const decoded = await parseDeepEXR(file, { level: { x: level, y: level } });
      checkSamples(decoded, Math.max(1, Math.ceil(7 / 2 ** level)), Math.max(1, Math.ceil(5 / 2 ** level)), 0, level, level);
    }
    await expect(parseDeepEXR(file, { level: { x: 1, y: 0 } })).rejects.toThrow(/level/i);
  });

  test("reads all independent rip levels", async () => {
    const file = fixture("deep_tiled_ripmap");
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      const decoded = await parseDeepEXR(file, { level: { x, y } });
      checkSamples(decoded, Math.max(1, Math.floor(7 / 2 ** x)), Math.max(1, Math.floor(5 / 2 ** y)), 0, x, y);
    }
    await expect(parseDeepEXR(file, { level: { x: 3, y: 0 } })).rejects.toThrow(/level/i);
  });

  test("bounds deep tile allocations and validates every part's chunks", async () => {
    const source = fixture("deep_multipart"), { tables } = multipartLayout(source), view = new DataView(source);
    await expect(parseDeepEXR(source, { part: 2, maxPixels: 34 })).rejects.toThrow(/limit/i);
    await expect(parseDeepEXR(source, { part: 2, maxSamples: 1 })).rejects.toThrow(/limit/i);
    await expect(parseDeepEXR(source, { part: 2, maxSamplesPerPixel: 1 })).rejects.toThrow(/limit/i);
    await expect(parseDeepEXR(source, { part: 2, maxSampleBytes: 20 })).rejects.toThrow(/limit/i);
    const firstTile = Number(view.getBigUint64(tables[2]!, true));
    const wrongOwner = source.slice(0); new DataView(wrongOwner).setInt32(firstTile, 1, true);
    await expect(parseDeepEXR(wrongOwner, { part: 1 })).rejects.toThrow(/different part/i);
    const badTile = source.slice(0); new DataView(badTile).setInt32(firstTile + 4, 99, true);
    await expect(parseDeepEXR(badTile, { part: 1 })).rejects.toThrow(/tile coordinates/i);
    const duplicate = source.slice(0); new DataView(duplicate).setBigUint64(tables[2]! + 8, BigInt(firstTile), true);
    await expect(parseDeepEXR(duplicate, { part: 2 })).rejects.toThrow(/duplicate/i);
    const excessive = source.slice(0); new DataView(excessive).setBigUint64(firstTile + 36, 0xffffffffffffffffn, true);
    await expect(parseDeepEXR(excessive, { part: 2 })).rejects.toThrow(/limit/i);
    await expect(parseDeepEXR(source.slice(0, source.byteLength - 1), { part: 1 })).rejects.toThrow(/truncated/i);
    const { attributes } = multipartLayout(source);
    const unsupported = source.slice(0); new Uint8Array(unsupported)[attributes[2]!.get("compression")!] = 10;
    await expect(parseDeepEXR(unsupported, { part: 2 })).rejects.toThrow(/HTJ2K256/i);
  });

  test("rejects oversized tile count tables and inflated count payloads", async () => {
    const source = fixture("deep_tiled_padded"), { table, attributes } = fixtureLayout(source);
    const oversizedTile = source.slice(0), tileView = new DataView(oversizedTile);
    tileView.setUint32(attributes.get("tiles")!, 16384, true);
    tileView.setUint32(attributes.get("tiles")! + 4, 16384, true);
    await expect(parseDeepEXR(oversizedTile)).rejects.toThrow(/tile.*limit/i);

    const bomb = source.slice(0), view = new DataView(bomb);
    const first = Number(view.getBigUint64(table, true));
    const payload = deflateSync(new Uint8Array(25)); // The declared 3x2 tile has at most 24 count bytes.
    new Uint8Array(bomb)[attributes.get("compression")!] = 2;
    view.setBigUint64(first + 16, BigInt(payload.length), true);
    new Uint8Array(bomb).set(payload, first + 40);
    await expect(parseDeepEXR(bomb)).rejects.toThrow(/exceed|size|length|buffer/i);
  });
});


describe("OpenEXR DWA channels", () => {
  for (const compression of ["dwaa", "dwab"] as const) {
    for (const output of ["half", "float"] as const) {
      test(`${compression} decodes every compressed UINT channel to ${output}`, async () => {
        const file = dwaFixture(compression);
        const { table } = fixtureLayout(file);
        const view = new DataView(file);
        const chunk = Number(view.getBigUint64(table, true));
        expect(view.getUint32(chunk + 4, true)).toBeLessThan(64 * 32 * 8);
        const decoded = await parseEXR(file, { type: output });
        expect(decoded).toMatchObject({ width: 64, height: 32, channels: 4, format: "rgba" });
        for (let y = 0; y < 32; y += 1) {
          for (let x = 0; x < 64; x += 1) {
            const base = ((31 - y) * 64 + x) * 4;
            const expected = [x + y, 0, 0, 100 + y];
            for (let channel = 0; channel < 4; channel += 1) {
              const raw = decoded.data[base + channel]!;
              expect(output === "half" ? halfToNumber(raw) : raw, `x=${x}, y=${y}, channel=${channel}`).toBe(expected[channel]);
            }
          }
        }
      });
    }
  }

  test.each(["dwaa", "dwab"] as const)("rejects forged %s section lengths and truncated data", async (compression) => {
    const file = dwaFixture(compression);
    const { table } = fixtureLayout(file);
    const view = new DataView(file);
    const chunk = Number(view.getBigUint64(table, true));
    view.setBigUint64(chunk + 8 + 16, 999999n, true);
    await expect(parseEXR(file)).rejects.toThrow();
    const pristine = dwaFixture(compression);
    await expect(parseEXR(pristine.slice(0, pristine.byteLength - 1))).rejects.toThrow();
  });

  for (const name of ["dwaa-rgb", "dwab-rgb", "tiled-dwaa-rgb"] as const) {
    for (const output of ["half", "float"] as const) {
      test(`${name} reconstructs all lossy RGB samples in ${output}`, async () => {
        const file = dwaFixture(name);
        const { table } = fixtureLayout(file);
        const view = new DataView(file);
        const chunk = Number(view.getBigUint64(table, true));
        const tiled = name.startsWith("tiled-");
        expect(view.getUint32(chunk + (tiled ? 16 : 4), true)).toBeLessThan(64 * 32 * 4 * 4);
        const decoded = await parseEXR(file, { type: output });
        expect(decoded).toMatchObject({ width: 64, height: 32, channels: 4, format: "rgba" });
        for (let y = 0; y < 32; y += 1) {
          for (let x = 0; x < 64; x += 1) {
            const base = ((31 - y) * 64 + x) * 4;
            const expected = [x / 63, y / 31, (x + y) / 94, 1];
            for (let channel = 0; channel < 4; channel += 1) {
              const raw = decoded.data[base + channel]!;
              const actual = output === "half" ? halfToNumber(raw) : raw;
              expect(Math.abs(actual - expected[channel]!), `x=${x}, y=${y}, channel=${channel}`).toBeLessThanOrEqual(0.007);
            }
          }
        }
      });
    }
  }

  test("DWA decodes negative HDR and partial DCT blocks with mixed HALF/FLOAT channels", async () => {
    const file = dwaFixture("variant0");
    const { table } = fixtureLayout(file);
    const view = new DataView(file);
    const chunk = Number(view.getBigUint64(table, true));
    expect(view.getUint32(chunk + 4, true)).toBeLessThan(37 * 31 * 12);
    const decoded = await parseEXR(file, { type: "float" });
    expect(decoded).toMatchObject({ width: 37, height: 31, channels: 4, format: "rgba" });
    for (let y = 0; y < 31; y += 1) {
      for (let x = 0; x < 37; x += 1) {
        const base = ((30 - y) * 37 + x) * 4;
        const v = x / 20 + y / 31;
        const expected = [v - 1, v - 0.5, v, 0.5];
        for (let channel = 0; channel < 4; channel += 1) {
          expect(Math.abs(decoded.data[base + channel]! - expected[channel]!), `x=${x}, y=${y}, channel=${channel}`).toBeLessThanOrEqual(0.03);
        }
      }
    }
  });
});


describe("OpenEXR B44 and B44A", () => {
  for (const compression of ["b44", "b44a"] as const) {
    for (const output of ["half", "float"] as const) {
      test(`${compression} matches OpenEXR readback of every mixed channel to ${output}`, async () => {
        const file = b44Fixture(`${compression}-exr`);
        const expected = new DataView(b44Fixture(`${compression}-raw`));
        const { table } = fixtureLayout(file);
        const view = new DataView(file);
        const chunk = Number(view.getBigUint64(table, true));
        expect(view.getUint32(chunk + 4, true)).toBeLessThan(16 * 10 * 12);
        const decoded = await parseEXR(file, { type: output });
        expect(decoded).toMatchObject({ width: 16, height: 10, channels: 4, format: "rgba" });
        expect(decoded.header.compression).toBe(`${compression.toUpperCase()}_COMPRESSION`);
        for (let y = 0; y < 10; y += 1) {
          for (let x = 0; x < 16; x += 1) {
            // Raw fixture stores file-order A/FLOAT, B/HALF, G/UINT, R/HALF.
            const row = y * 16 * 12;
            const expectedChannels = [
              halfToNumber(expected.getUint16(row + 160 + x * 2, true)),
              expected.getUint32(row + 96 + x * 4, true),
              halfToNumber(expected.getUint16(row + 64 + x * 2, true)),
              expected.getFloat32(row + x * 4, true)
            ];
            const pixel = ((9 - y) * 16 + x) * 4;
            for (let channel = 0; channel < 4; channel += 1) {
              const raw = decoded.data[pixel + channel]!;
              expect(output === "half" ? halfToNumber(raw) : raw, `x=${x}, y=${y}, channel=${channel}`).toBe(expectedChannels[channel]);
            }
          }
        }
      });
    }
  }

  test("B44A encodes flat HALF blocks as three-byte records", () => {
    const file = b44Fixture("b44a-exr");
    const { table } = fixtureLayout(file);
    const view = new DataView(file);
    const bytes = new Uint8Array(file);
    const chunk = Number(view.getBigUint64(table, true));
    const end = chunk + 8 + view.getUint32(chunk + 4, true);
    let cursor = chunk + 8 + 16 * 10 * 4; // FLOAT A
    for (let block = 0; block < 12; block += 1) { // pLinear HALF B
      expect(bytes[cursor + 2]).not.toBe(0xfc);
      cursor += 14;
    }
    cursor += 16 * 10 * 4; // UINT G
    for (let block = 0; block < 12; block += 1) { // flat HALF R
      expect(bytes[cursor + 2]).toBe(0xfc);
      cursor += 3;
    }
    expect(cursor).toBe(end);
  });

  test.each(["b44", "b44a"] as const)("rejects truncated or corrupt %s payloads", async (compression) => {
    const original = b44Fixture(`${compression}-exr`);
    await expect(parseEXR(original.slice(0, original.byteLength - 1))).rejects.toThrow();
    const damaged = b44Fixture(`${compression}-exr`);
    const { table } = fixtureLayout(damaged);
    const view = new DataView(damaged);
    const chunk = Number(view.getBigUint64(table, true));
    view.setUint32(chunk + 4, view.getUint32(chunk + 4, true) - 1, true);
    await expect(parseEXR(damaged)).rejects.toThrow();
  });
});
