export type EditorLocaleDirection = "ltr" | "rtl";
export type EditorPluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
export type EditorAccessibilityRole = "button" | "navigation" | "slider" | "textbox" | "status" | "dialog";

export interface EditorLocaleDescriptor {
  readonly code: string;
  readonly displayName: string;
  readonly direction: EditorLocaleDirection;
  readonly currencySymbol: string;
  readonly decimalSeparator: string;
  readonly thousandsSeparator: string;
  readonly currencyPosition: "before" | "after";
}

export interface EditorLocalizedStringSample {
  readonly locale: string;
  readonly direction: EditorLocaleDirection;
  readonly title: string;
  readonly assetCount: string;
  readonly fallbackTitle: string;
  readonly missingKey: string;
  readonly formattedNumber: string;
  readonly formattedCurrency: string;
  readonly pluralCategory: EditorPluralCategory;
}

export interface EditorAccessibilityElementSample {
  readonly id: string;
  readonly role: EditorAccessibilityRole;
  readonly label: string;
  readonly tabIndex: number;
  readonly focusable: boolean;
  readonly disabled?: boolean;
  readonly ariaLive?: "polite" | "assertive";
  readonly contrastRatio: number;
  readonly contrastPassesAA: boolean;
}

export interface EditorLocalizationAccessibilityFixture {
  readonly source: "origin-master-localization-ui-accessibility-adapted";
  readonly sourceFiles: readonly string[];
  readonly localeCount: number;
  readonly rtlLocaleCount: number;
  readonly tableKeyCount: number;
  readonly jsonLoaderValidated: boolean;
  readonly csvLoaderValidated: boolean;
  readonly hotSwapLocale: {
    readonly from: string;
    readonly to: string;
    readonly directionChanged: boolean;
    readonly listenerNotifications: readonly string[];
  };
  readonly samples: readonly EditorLocalizedStringSample[];
  readonly missingKeys: readonly string[];
  readonly accessibility: {
    readonly elementCount: number;
    readonly labelledControls: number;
    readonly focusOrder: readonly string[];
    readonly focusWalk: readonly string[];
    readonly liveRegionAnnouncements: readonly string[];
    readonly highContrastMode: boolean;
    readonly minContrastRatio: number;
    readonly aaContrastPasses: boolean;
  };
  readonly blockedClaims: readonly string[];
  readonly claimBoundary: string;
  readonly hash: string;
}

type StringTable = Record<string, string>;

const sourceFiles = [
  "origin/master:src/localization/LocalizationManager.ts",
  "origin/master:src/localization/StringTable.ts",
  "origin/master:src/localization/Locale.ts",
  "origin/master:src/localization/Pluralization.ts",
  "origin/master:src/localization/loaders/JSONLocaleLoader.ts",
  "origin/master:src/localization/loaders/CSVLocaleLoader.ts",
  "origin/master:src/ui/UIAccessibility.ts"
] as const;

const blockedClaims = [
  "full localization pipeline",
  "ICU MessageFormat parity",
  "bidirectional text shaping parity",
  "screen-reader certification",
  "WCAG conformance certification",
  "Unity UI Toolkit parity",
  "Unreal UMG parity"
] as const;

const locales: readonly EditorLocaleDescriptor[] = [
  {
    code: "en-US",
    displayName: "English (United States)",
    direction: "ltr",
    currencySymbol: "$",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    currencyPosition: "before"
  },
  {
    code: "es-ES",
    displayName: "Spanish (Spain)",
    direction: "ltr",
    currencySymbol: "EUR",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    currencyPosition: "after"
  },
  {
    code: "ar-SA",
    displayName: "Arabic (Saudi Arabia)",
    direction: "rtl",
    currencySymbol: "SAR",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    currencyPosition: "after"
  }
] as const;

const stringTables: Record<string, StringTable> = {
  "en-US": {
    "editor.title": "Galileo3D Editor",
    "assets.count.one": "{count} imported asset",
    "assets.count.other": "{count} imported assets",
    "status.saved": "Saved",
    "panel.inspector": "Inspector"
  },
  "es-ES": {
    "editor.title": "Editor Galileo3D",
    "assets.count.one": "{count} recurso importado",
    "assets.count.other": "{count} recursos importados",
    "status.saved": "Guardado"
  },
  "ar-SA": {
    "editor.title": "Galileo3D RTL Editor",
    "assets.count.zero": "no imported assets",
    "assets.count.one": "{count} imported asset",
    "assets.count.two": "{count} imported assets",
    "assets.count.few": "{count} imported assets",
    "assets.count.many": "{count} imported assets",
    "assets.count.other": "{count} imported assets",
    "status.saved": "Saved RTL"
  }
};

const accessibilityElements: readonly EditorAccessibilityElementSample[] = [
  createAccessibilityElement("command-menu", "navigation", "Command menu", 1, "#f7fafc", "#101820"),
  createAccessibilityElement("viewport", "status", "Editor WebGL viewport", 2, "#f5f7fb", "#07111c", "polite"),
  createAccessibilityElement("inspector-name", "textbox", "Selected node name", 3, "#111827", "#f9fafb"),
  createAccessibilityElement("timeline-scrub", "slider", "Timeline scrub time", 4, "#0f172a", "#e0f2fe"),
  createAccessibilityElement("export-project", "button", "Export Project", 5, "#ffffff", "#1d4ed8")
];

export function sampleLocalizationAccessibilityFixture(options: {
  readonly assetCount?: number;
  readonly hotSwapFrom?: string;
  readonly hotSwapTo?: string;
} = {}): EditorLocalizationAccessibilityFixture {
  const assetCount = Math.max(0, Math.floor(options.assetCount ?? 2));
  const hotSwapFrom = options.hotSwapFrom ?? "en-US";
  const hotSwapTo = options.hotSwapTo ?? "ar-SA";
  const fromLocale = requireLocale(hotSwapFrom);
  const toLocale = requireLocale(hotSwapTo);
  const listenerNotifications = [fromLocale.code, toLocale.code];
  const samples = locales.map((locale) => sampleLocale(locale, assetCount));
  const missingKeys = findMissingKeys(stringTables["en-US"] ?? {}, stringTables["es-ES"] ?? {});
  const focusOrder = accessibilityElements
    .filter((element) => element.focusable && !element.disabled)
    .sort((left, right) => left.tabIndex - right.tabIndex)
    .map((element) => element.id);
  const focusWalk = [focusOrder[0], focusOrder[1], focusOrder[2], focusOrder[1]].filter((id): id is string => Boolean(id));
  const minContrastRatio = Math.min(...accessibilityElements.map((element) => element.contrastRatio));
  const fixtureWithoutHash = {
    source: "origin-master-localization-ui-accessibility-adapted" as const,
    sourceFiles,
    localeCount: locales.length,
    rtlLocaleCount: locales.filter((locale) => locale.direction === "rtl").length,
    tableKeyCount: Object.values(stringTables).reduce((sum, table) => sum + Object.keys(table).length, 0),
    jsonLoaderValidated: validateJsonTableShape(stringTables),
    csvLoaderValidated: validateCsvTableShape(toCsv(stringTables)),
    hotSwapLocale: {
      from: fromLocale.code,
      to: toLocale.code,
      directionChanged: fromLocale.direction !== toLocale.direction,
      listenerNotifications
    },
    samples,
    missingKeys,
    accessibility: {
      elementCount: accessibilityElements.length,
      labelledControls: accessibilityElements.filter((element) => element.label.trim().length > 0).length,
      focusOrder,
      focusWalk,
      liveRegionAnnouncements: ["Focused: Command menu", "Focused: Editor WebGL viewport", "Saved"],
      highContrastMode: true,
      minContrastRatio,
      aaContrastPasses: accessibilityElements.every((element) => element.contrastPassesAA)
    },
    blockedClaims,
    claimBoundary: "This fixture ports bounded old localization and UI accessibility concepts into deterministic editor-runtime evidence. It does not certify WCAG compliance, native assistive technology behavior, ICU parity, or Unity/Unreal UI parity."
  };
  return {
    ...fixtureWithoutHash,
    hash: stableHash(JSON.stringify(fixtureWithoutHash))
  };
}

function sampleLocale(locale: EditorLocaleDescriptor, assetCount: number): EditorLocalizedStringSample {
  const pluralCategory = cardinalPluralCategory(locale.code, assetCount);
  const table = stringTables[locale.code] ?? {};
  const fallback = stringTables["en-US"] ?? {};
  return {
    locale: locale.code,
    direction: locale.direction,
    title: lookup(table, fallback, "editor.title", {}),
    assetCount: lookup(table, fallback, `assets.count.${pluralCategory}`, { count: assetCount }),
    fallbackTitle: lookup(table, fallback, "panel.inspector", {}),
    missingKey: lookup(table, fallback, "missing.key", {}),
    formattedNumber: formatNumber(locale, 1234.5, 2),
    formattedCurrency: formatCurrency(locale, 1234.5),
    pluralCategory
  };
}

function lookup(table: StringTable, fallback: StringTable, key: string, params: Record<string, number | string>): string {
  const template = table[key] ?? fallback[key];
  if (!template) return `[${key}]`;
  return template.replace(/\{([^}]+)\}/g, (match, name) => String(params[name] ?? match));
}

function cardinalPluralCategory(localeCode: string, count: number): EditorPluralCategory {
  const language = localeCode.split("-")[0] ?? localeCode;
  if (language === "ar") {
    if (count === 0) return "zero";
    if (count === 1) return "one";
    if (count === 2) return "two";
    if (count % 100 >= 3 && count % 100 <= 10) return "few";
    if (count % 100 >= 11 && count % 100 <= 99) return "many";
    return "other";
  }
  return count === 1 ? "one" : "other";
}

function formatNumber(locale: EditorLocaleDescriptor, value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const [integer = "0", decimal = ""] = fixed.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, locale.thousandsSeparator);
  return decimal.length > 0 ? `${grouped}${locale.decimalSeparator}${decimal}` : grouped;
}

function formatCurrency(locale: EditorLocaleDescriptor, value: number): string {
  const formatted = formatNumber(locale, value, 2);
  return locale.currencyPosition === "before" ? `${locale.currencySymbol}${formatted}` : `${formatted} ${locale.currencySymbol}`;
}

function findMissingKeys(reference: StringTable, target: StringTable): readonly string[] {
  return Object.keys(reference).filter((key) => target[key] === undefined).sort();
}

function requireLocale(code: string): EditorLocaleDescriptor {
  const locale = locales.find((candidate) => candidate.code === code);
  if (!locale) throw new Error(`Unknown editor locale fixture: ${code}`);
  return locale;
}

function validateJsonTableShape(tables: Record<string, StringTable>): boolean {
  return Object.values(tables).every((table) => Object.values(table).every((value) => typeof value === "string" && value.length > 0));
}

function validateCsvTableShape(csv: string): boolean {
  const rows = csv.split("\n").filter((line) => line.trim().length > 0);
  if (rows.length < 2) return false;
  const expectedColumns = parseCsvLine(rows[0] ?? "").length;
  return expectedColumns >= 2 && rows.slice(1).every((line) => parseCsvLine(line).length === expectedColumns);
}

function toCsv(tables: Record<string, StringTable>): string {
  const localeCodes = Object.keys(tables).sort();
  const keys = [...new Set(localeCodes.flatMap((locale) => Object.keys(tables[locale] ?? {})))].sort();
  return [
    ["Key", ...localeCodes].join(","),
    ...keys.map((key) => [key, ...localeCodes.map((locale) => escapeCsv(tables[locale]?.[key] ?? ""))].join(","))
  ].join("\n");
}

function parseCsvLine(line: string): readonly string[] {
  const columns: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      columns.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  columns.push(current);
  return columns;
}

function escapeCsv(value: string): string {
  return value.includes(",") || value.includes("\"") || value.includes("\n") ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

function createAccessibilityElement(
  id: string,
  role: EditorAccessibilityRole,
  label: string,
  tabIndex: number,
  foreground: string,
  background: string,
  ariaLive?: "polite" | "assertive"
): EditorAccessibilityElementSample {
  const contrastRatio = Number(contrast(foreground, background).toFixed(2));
  return {
    id,
    role,
    label,
    tabIndex,
    focusable: true,
    ...(ariaLive ? { ariaLive } : {}),
    contrastRatio,
    contrastPassesAA: contrastRatio >= 4.5
  };
}

function contrast(foreground: string, background: string): number {
  const foregroundLum = luminance(hexToRgb(foreground));
  const backgroundLum = luminance(hexToRgb(background));
  const light = Math.max(foregroundLum, backgroundLum);
  const dark = Math.min(foregroundLum, backgroundLum);
  return (light + 0.05) / (dark + 0.05);
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255
  ];
}

function luminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
