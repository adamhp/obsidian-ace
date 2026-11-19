// Pure logic. Must not import from "obsidian" (runs under Vitest in Node).
import { cleanName, linkTarget, str, strList, templatePath } from "./rules";

export type PropType = "text" | "number" | "checkbox" | "date" | "datetime" | "list";

export const RESERVED_FIELDS: readonly string[] = ["kind", "up", "source", "effort", "intensity", "from"];

const PROP_TYPES: Record<string, PropType> = {
  text: "text", number: "number", checkbox: "checkbox", date: "date", datetime: "datetime",
  multitext: "list", tags: "list", aliases: "list", list: "list",
};

export function parseTypes(json: string): Record<string, string> {
  try {
    const t = (JSON.parse(json) as { types?: unknown } | null)?.types;
    if (t === null || typeof t !== "object" || Array.isArray(t)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(t)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function propType(types: Record<string, string>, name: string): PropType {
  const t = Object.prototype.hasOwnProperty.call(types, name) ? types[name] : undefined;
  return (t !== undefined && Object.prototype.hasOwnProperty.call(PROP_TYPES, t) ? PROP_TYPES[t] : null) ?? "text";
}

export function toValue(type: PropType, raw: string | boolean): unknown {
  if (type === "checkbox") return raw === true || raw === "true";
  const s = String(raw).trim();
  switch (type) {
    case "number":
      return s === "" ? null : Number(s);
    case "list": {
      const items = s.split(",").map((x) => x.trim()).filter((x) => x !== "");
      return items.length > 0 ? items : null;
    }
    default:
      return s === "" ? null : s;
  }
}

export function numberError(raw: string): string | null {
  const s = raw.trim();
  return s === "" || Number.isFinite(Number(s)) ? null : "Enter a number.";
}

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function titlePart(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.map((x) => titlePart(x)).filter((x) => x !== "").join(", ");
  return String(v).trim();
}

export function fillTitle(template: string, answers: Record<string, unknown>): string {
  const filled = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(answers, k) ? titlePart(answers[k]) : m);
  return cleanName(filled).replace(/\s+/g, " ").trim();
}

export function fieldNameError(name: string, existing: string[]): string | null {
  const n = name.trim();
  if (n === "") return "Enter a name.";
  if (RESERVED_FIELDS.includes(n.toLowerCase())) return `ACE writes ${n} itself.`;
  if (existing.some((e) => e.toLowerCase() === n.toLowerCase())) return "Already a field.";
  return null;
}

export interface FieldDraft { name: string; options: string[]; default: string | null }
export interface KindDraft {
  folder: string;
  isSource: boolean;
  defaultUp: string | null;
  fields: FieldDraft[];
  titleTemplate: string;
  template: string;
}

export function draftFromFrontmatter(fm: Record<string, unknown>): KindDraft {
  const src = fm.is_source;
  return {
    folder: str(fm.folder) ?? "",
    isSource: src === true || (typeof src === "string" && src.trim().toLowerCase() === "true"),
    defaultUp: linkTarget(fm.default_up),
    fields: strList(fm.fields).map((name) => ({
      name,
      options: strList(fm[`${name}_options`]),
      default: str(fm[`${name}_default`]),
    })),
    titleTemplate: str(fm.title_template) ?? "",
    template: str(fm.template) ?? "",
  };
}

function setOrDelete(fm: Record<string, unknown>, key: string, value: unknown, empty: boolean): void {
  if (empty) delete fm[key];
  else fm[key] = value;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Writes only the keys whose draft value differs from `initial`, so a lossy
// parse (a scalar `fields`, a numeric default, a quoted link) is never written back.
export function applyDraft(fm: Record<string, unknown>, draft: KindDraft, initial: KindDraft): void {
  if (draft.folder !== initial.folder) setOrDelete(fm, "folder", draft.folder, draft.folder === "");
  if (draft.isSource !== initial.isSource) setOrDelete(fm, "is_source", true, !draft.isSource);
  if (draft.defaultUp !== initial.defaultUp) {
    setOrDelete(fm, "default_up", draft.defaultUp, draft.defaultUp === null || draft.defaultUp === "");
  }
  const names = draft.fields.map((f) => f.name);
  const oldNames = initial.fields.map((f) => f.name);
  if (!same(names, oldNames)) setOrDelete(fm, "fields", names, names.length === 0);
  if (draft.titleTemplate !== initial.titleTemplate) {
    setOrDelete(fm, "title_template", draft.titleTemplate, draft.titleTemplate === "");
  }
  if (draft.template !== initial.template) setOrDelete(fm, "template", draft.template, draft.template === "");
  for (const x of oldNames) {
    if (names.includes(x)) continue;
    delete fm[`${x}_options`];
    delete fm[`${x}_default`];
  }
  for (const f of draft.fields) {
    const old = initial.fields.find((o) => o.name === f.name) ?? { name: f.name, options: [], default: null };
    if (!same(f.options, old.options)) setOrDelete(fm, `${f.name}_options`, f.options, f.options.length === 0);
    if (f.default !== old.default) setOrDelete(fm, `${f.name}_default`, f.default, f.default === null || f.default === "");
  }
}

export interface ProblemContext {
  folderExists(path: string): boolean;
  fileExists(path: string): boolean;
  mapNames: string[];
}

// A missing thing the editor can create with one button.
export interface ProblemFix {
  type: "folder" | "map" | "file";
  target: string;
}

export interface Problem {
  text: string;
  fix?: ProblemFix;
}

export function kindProblems(draft: KindDraft, fm: Record<string, unknown>, ctx: ProblemContext): Problem[] {
  const out: Problem[] = [];
  const say = (text: string) => out.push({ text });
  const folder = draft.folder.replace(/^\/+/, "").replace(/\/+$/, "");
  if (folder !== "" && !ctx.folderExists(folder)) {
    out.push({ text: `Folder "${draft.folder}" doesn't exist.`, fix: { type: "folder", target: folder } });
  }
  const up = draft.defaultUp;
  if (up !== null && up !== "" && !ctx.mapNames.some((m) => m.toLowerCase() === up.toLowerCase())) {
    out.push({ text: `Default Map "${up}" not found.`, fix: { type: "map", target: up } });
  }
  for (const f of draft.fields) {
    if (f.default !== null && f.default.trim() !== "" && f.options.length > 0 && !f.options.includes(f.default)) {
      say(`Default for ${f.name} ("${f.default}") isn't one of its options.`);
    }
  }
  const names = draft.fields.map((f) => f.name);
  for (const m of draft.titleTemplate.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    if (!names.includes(m[1])) say(`Title template uses {{${m[1]}}}, which isn't a field.`);
  }
  if (draft.template.trim() !== "") {
    const path = templatePath(draft.template);
    if (path !== null && !ctx.fileExists(path)) {
      out.push({ text: `Template file "${draft.template}" not found.`, fix: { type: "file", target: path } });
    }
  }
  for (const key of Object.keys(fm)) {
    const m = /^default_(.+)$/.exec(key);
    if (m && key !== "default_up") {
      say(isEmptyValue(fm[key])
        ? `${key} is an old, empty key. Delete it.`
        : `${key} looks like an old key. Rename it to ${m[1]}_default.`);
    }
  }
  for (const key of Object.keys(fm)) {
    const m = /^(.+)_(options|default)$/.exec(key);
    if (m && !names.includes(m[1])) say(`${key} is set, but ${m[1]} isn't a field.`);
  }
  return out;
}

export function usesKind(kindValue: unknown, kindName: string): boolean {
  const t = linkTarget(kindValue);
  return t !== null && t.toLowerCase() === kindName.toLowerCase();
}
