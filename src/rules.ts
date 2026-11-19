// Pure logic. Must not import from "obsidian" (runs under Vitest in Node).

export interface KindConfig {
  name: string;
  folder: string;
  isSource: boolean;
  defaultStatus: string | null;
  statusOptions: string[];
  defaultUp: string | null;
  fields: string[];
  template: string | null;
  effortStatus: string | null;
  effortStatusActive: string | null;
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

function folderSetting(v: unknown, def: string): string {
  if (typeof v !== "string") return def;
  const s = v.trim().replace(/^\/+/, "").replace(/\/+$/, "").trim();
  return s === "" ? def : s;
}

function textSetting(v: unknown, def: string, allowEmpty: boolean): string {
  if (typeof v !== "string") return def;
  return v === "" && !allowEmpty ? def : v;
}

// Intensities become file names and links, so items with forbidden characters are dropped.
export function parseIntensities(text: string): string[] {
  return text
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "" && !/[\\/:*?"<>|#^[\]]/.test(x));
}

export function normalizeSettings(raw: unknown): AceSettings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  let list: string[] = [];
  if (typeof r.intensities === "string") list = parseIntensities(r.intensities);
  else if (Array.isArray(r.intensities)) {
    list = parseIntensities(r.intensities.filter((x): x is string => typeof x === "string").join(","));
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

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function strList(v: unknown): string[] {
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

function templatePath(v: unknown): string | null {
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
  return {
    name,
    folder: folder === "" ? defaultFolder : folder,
    isSource: src === true || (typeof src === "string" && src.trim().toLowerCase() === "true"),
    defaultStatus: str(f.default_status),
    statusOptions: strList(f.status_options),
    defaultUp: linkTarget(f.default_up),
    fields: strList(f.fields),
    template: templatePath(f.template),
    effortStatus: str(f.effort_status),
    effortStatusActive: str(f.effort_status_active),
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

export function effortStatus(kind: KindConfig | null, intensity: string, intensities: string[]): string | null {
  if (kind === null) return null;
  if (intensity === intensities[0] && kind.effortStatusActive !== null) return kind.effortStatusActive;
  return kind.effortStatus;
}

// Replaces known {{key}} placeholders; unknown ones stay as written.
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));
}

export interface StatusChoice {
  label: string;
  value: string | null;
  // true for "(keep X)": the note's existing status stays; false/absent for "(no status)".
  keep?: boolean;
}

// value null = write no status (keeps any existing one).
export function statusChoices(
  options: string[],
  current: string | null,
  defaultStatus: string | null,
): StatusChoice[] {
  const cur = current === null ? "" : current.trim();
  const none: StatusChoice = { label: "(no status)", value: null };
  const set = (s: string): StatusChoice => ({ label: s, value: s });
  if (cur !== "" && !options.includes(cur)) {
    return [{ label: `(keep ${cur})`, value: null, keep: true }, ...options.map(set), none];
  }
  const first = cur !== "" ? cur : defaultStatus;
  const opts = withFirst(options, first);
  if (first !== null && opts[0] === first) return [...opts.map(set), none];
  return [none, ...opts.map(set)];
}

// Status to write for a new or re-kinded note. The kind default applies only when
// no status question was asked; an explicit choice (including "(no status)") wins.
export function resolveStatus(
  asked: boolean,
  chosen: string | null,
  defaultStatus: string | null,
  existing: unknown = null,
): string | null {
  if (chosen !== null) return chosen;
  if (asked) return null;
  const has = typeof existing === "string" ? existing.trim() !== "" : existing != null;
  return has ? null : defaultStatus;
}
