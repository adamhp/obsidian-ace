// Pure logic. Must not import from "obsidian" (runs under Vitest in Node).

export interface KindConfig {
  name: string;
  folder: string;
  isSource: boolean;
  defaultUp: string | null;
  fields: string[];
  template: string | null;
  titleTemplate: string | null;
  // Only fields that have options.
  fieldOptions: Record<string, string[]>;
  // Every field; null when unset.
  fieldDefaults: Record<string, string | null>;
}

export interface AceSettings {
  atlasFolder: string;
  kindsFolder: string;
  mapsFolder: string;
  defaultFolder: string;
  sourcesFolder: string;
  effortsFolder: string;
  intensities: string[];
  newEffortText: string;
  makeEffortText: string;
  logFormat: string;
  dateFormat: string;
  timeFormat: string;
}

export const DEFAULT_SETTINGS: AceSettings = {
  atlasFolder: "Atlas",
  kindsFolder: "Atlas/Kinds",
  mapsFolder: "Atlas/Maps",
  defaultFolder: "Atlas/Dots",
  sourcesFolder: "Atlas/Sources",
  effortsFolder: "Efforts",
  intensities: ["on", "ongoing", "simmering", "sleeping"],
  newEffortText: "## Goal\n\n\n\n## Next steps\n\n- [ ] \n\n## Log\n\n",
  makeEffortText: "Started from {{note}}.\n\n## Next steps\n\n- [ ] \n",
  logFormat: "[[{{date}}]] {{time}}: ",
  dateFormat: "YYYY-MM-DD",
  timeFormat: "HH:mm",
};

export function folderSetting(v: unknown, def: string): string {
  if (typeof v !== "string") return def;
  const s = v.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+/, "").replace(/\/+$/, "").trim();
  return s === "" ? def : s;
}

export function textSetting(v: unknown, def: string, allowEmpty: boolean): string {
  if (typeof v !== "string") return def;
  return v === "" && !allowEmpty ? def : v;
}

// Intensities are stored in note properties and links, so items with [ ] { } : # | are dropped.
function cleanIntensities(items: string[]): string[] {
  return items.map((x) => x.trim()).filter((x) => x !== "" && !/[[\]{}:#|]/.test(x));
}

export function parseIntensities(text: string): string[] {
  return cleanIntensities(text.split(","));
}

// Why a new intensity can't be added, or null if it can.
export function intensityError(v: string, existing: string[]): string | null {
  const s = v.trim();
  if (s === "") return "Enter a name.";
  if (/[[\]{}:#|]/.test(s)) return "Avoid the characters [ ] { } : # |.";
  if (existing.some((x) => x.toLowerCase() === s.toLowerCase())) return "Already in the list.";
  return null;
}

export function normalizeSettings(raw: unknown): AceSettings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  let list: string[] = [];
  if (typeof r.intensities === "string") list = parseIntensities(r.intensities);
  else if (Array.isArray(r.intensities)) {
    list = cleanIntensities(r.intensities.filter((x): x is string => typeof x === "string"));
  }
  return {
    atlasFolder: folderSetting(r.atlasFolder, d.atlasFolder),
    kindsFolder: folderSetting(r.kindsFolder, d.kindsFolder),
    mapsFolder: folderSetting(r.mapsFolder, d.mapsFolder),
    defaultFolder: folderSetting(r.defaultFolder, d.defaultFolder),
    sourcesFolder: folderSetting(r.sourcesFolder, d.sourcesFolder),
    effortsFolder: folderSetting(r.effortsFolder, d.effortsFolder),
    intensities: list.length > 0 ? list : [...d.intensities],
    newEffortText: textSetting(r.newEffortText, d.newEffortText, true),
    makeEffortText: textSetting(r.makeEffortText, d.makeEffortText, true),
    logFormat: textSetting(r.logFormat, d.logFormat, false),
    dateFormat: textSetting(r.dateFormat, d.dateFormat, false),
    timeFormat: textSetting(r.timeFormat, d.timeFormat, false),
  };
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter((x): x is string => x !== null);
}

// YAML parses an unquoted `[[X]]` as a nested array [["X"]]; read it as the link [[X]].
function unnest(item: unknown): unknown {
  if (Array.isArray(item) && item.length === 1 && typeof item[0] === "string") {
    const s = item[0].trim();
    return s === "" ? item : `[[${s}]]`;
  }
  return item;
}

export function linkTarget(value: unknown): string | null {
  const first = unnest(Array.isArray(value) ? value[0] : value);
  let s = str(first);
  if (s === null) return null;
  const m = /^\[\[(.*)\]\]$/.exec(s);
  if (m) s = m[1];
  s = s.split("|")[0].split("#")[0].trim();
  s = s.slice(s.lastIndexOf("/") + 1).replace(/\.md$/i, "").trim();
  return s === "" ? null : s;
}

// Items it cannot read are kept unchanged, never dropped.
export function linkList(value: unknown): unknown[] {
  const items = Array.isArray(value) ? value : [value];
  const out: unknown[] = [];
  for (const raw of items) {
    if (raw === null || raw === undefined) continue;
    const item = unnest(raw);
    if (typeof item !== "string") {
      out.push(raw);
      continue;
    }
    const s = item.trim();
    if (s === "") continue;
    if (/^\[\[.*\]\]$/.test(s)) out.push(s);
    else {
      const t = linkTarget(s);
      if (t !== null) out.push(`[[${t}]]`);
    }
  }
  return out;
}

export function addLink(value: unknown, target: string): unknown[] {
  const list = linkList(value);
  if (list.some((l) => typeof l === "string" && linkTarget(l)?.toLowerCase() === target.toLowerCase())) return list;
  return [...list, `[[${target}]]`];
}

export function templatePath(v: unknown): string | null {
  const s = str(v);
  if (s === null) return null;
  const m = /^\[\[(.*)\]\]$/.exec(s);
  let p = (m ? m[1] : s).split("|")[0].split("#")[0].trim();
  if (p === "") return null;
  if (!/\.md$/i.test(p)) p += ".md";
  return p;
}

export function parseKindConfig(
  name: string,
  fm: Record<string, unknown> | undefined,
  defaultFolder: string = DEFAULT_SETTINGS.defaultFolder,
): KindConfig {
  const f = fm ?? {};
  const folder = (str(f.folder) ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
  const src = f.is_source;
  const fields = strList(f.fields);
  const fieldOptions: Record<string, string[]> = {};
  const fieldDefaults: Record<string, string | null> = {};
  for (const x of fields) {
    const opts = strList(f[`${x}_options`]);
    if (opts.length > 0) fieldOptions[x] = opts;
    fieldDefaults[x] = str(f[`${x}_default`]);
  }
  return {
    name,
    folder: folder === "" ? defaultFolder : folder,
    isSource: src === true || (typeof src === "string" && src.trim().toLowerCase() === "true"),
    defaultUp: linkTarget(f.default_up),
    fields,
    template: templatePath(f.template),
    titleTemplate: str(f.title_template),
    fieldOptions,
    fieldDefaults,
  };
}

export function cleanName(raw: string): string {
  return raw.replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
}

export function isTaken(name: string, basenames: Iterable<string>): boolean {
  const n = name.toLowerCase();
  for (const b of basenames) if (b.toLowerCase() === n) return true;
  return false;
}

export function isUnder(path: string, folder: string): boolean {
  return path.startsWith(folder + "/");
}

export function shouldMove(
  path: string,
  folder: string,
  effortsFolder: string = DEFAULT_SETTINGS.effortsFolder,
): boolean {
  if (isUnder(path, effortsFolder)) return false;
  const i = path.lastIndexOf("/");
  const parent = i < 0 ? "" : path.slice(0, i);
  return parent !== folder;
}

export function firstUrl(content: string): string | null {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "");
  const m = /https?:\/\/[^\s)\]>"']+/.exec(body);
  return m ? m[0] : null;
}

export function withFirst(items: string[], first: string | null): string[] {
  if (first === null || !items.includes(first)) return items;
  return [first, ...items.filter((x) => x !== first)];
}

// Replaces known {{key}} placeholders; unknown ones stay as written.
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));
}
