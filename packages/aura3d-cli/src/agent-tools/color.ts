// Static colour check for `aura3d validate`. Accepts exactly the forms the engine's C-06 colour parser accepts
// (packages/engine/src/agent-api/color.ts): #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() and hsl()/hsla() in comma or space syntax,
// oklch(), "transparent", the 148 CSS named colours, and 0xRRGGBB / 0xRRGGBBAA numbers. The engine throws COLOR_INVALID on anything else;
// this catches it before a build. A parity test (tests/unit/aura3d-cli/agent-tools.test.ts) keeps the name list in step with the engine.

/** The 148 CSS named colours, lower case. */
export const CSS_COLOR_NAMES: ReadonlySet<string> = new Set("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(" "));

function splitArgs(body: string): string[] {
  if (body.includes(",")) return body.split(",").map((p) => p.trim());
  const slash = body.split("/").map((p) => p.trim());
  const first = slash[0]!.split(/\s+/).filter((p) => p.length > 0);
  if (slash.length > 1) first.push(slash[1]!);
  return first;
}

const finiteNumber = (token: string): boolean => token.trim() !== "" && Number.isFinite(Number(token.trim()));
const channel = (token: string): boolean => { const t = token.trim(); return t.endsWith("%") ? finiteNumber(t.slice(0, -1)) : finiteNumber(t); };
const hue = (token: string): boolean => { const t = token.trim(); return t.endsWith("deg") ? finiteNumber(t.slice(0, -3)) : t.endsWith("turn") ? finiteNumber(t.slice(0, -4)) : finiteNumber(t); };

/** Why a colour string is invalid, or undefined when the engine parser accepts it. */
export function colorStringProblem(input: string): string | undefined {
  const value = input.trim();
  const hex = /^#([0-9a-f]+)$/i.exec(value);
  if (hex) return [3, 4, 6, 8].includes(hex[1]!.length) ? undefined : `hex colour "${value}" has ${hex[1]!.length} digits (use 3, 4, 6 or 8)`;
  if (value.startsWith("#")) return `"${value}" is not a hex colour (only 0-9 and a-f after #)`;
  const fn = /^(rgb|rgba|hsl|hsla|oklch)\((.+)\)$/i.exec(value);
  if (fn) {
    const name = fn[1]!.toLowerCase();
    const args = splitArgs(fn[2]!);
    if (args.length !== 3 && args.length !== 4) return `${name}() needs 3 values (plus optional alpha), got ${args.length}`;
    const alphaOk = args[3] === undefined || channel(args[3]);
    if (name.startsWith("rgb")) return args.slice(0, 3).every(channel) && alphaOk ? undefined : `"${value}" has a value that is not a number or percentage`;
    if (name.startsWith("hsl")) return hue(args[0]!) && channel(args[1]!) && channel(args[2]!) && alphaOk ? undefined : `"${value}" has a value that is not a number, angle or percentage`;
    return channel(args[0]!) && channel(args[1]!) && hue(args[2]!) && alphaOk ? undefined : `"${value}" has a value that is not a number, angle or percentage`;
  }
  if (/^[a-z]+\(/i.test(value)) return `"${value.split("(")[0]}()" is not a supported colour function (use rgb(), hsl() or oklch())`;
  const lower = value.toLowerCase();
  if (lower === "transparent" || CSS_COLOR_NAMES.has(lower)) return undefined;
  if (CSS_COLOR_NAMES.has(lower.replace(/[\s_-]+/g, ""))) return `"${value}" is not a CSS colour name; write "${lower.replace(/[\s_-]+/g, "")}"`;
  return `"${value}" is not a hex value, colour function or CSS colour name`;
}
