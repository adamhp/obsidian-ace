import { describe, it, expect } from "vitest";
import { parseKindConfig } from "../src/rules";
import {
  parseTypes, propType, toValue, numberError, isEmptyValue, fillTitle, fieldNameError,
  draftFromFrontmatter, applyDraft, kindProblems, usesKind, oldKindKey,
} from "../src/kinds";

describe("parseKindConfig field specs", () => {
  it("options, defaults, title template", () => {
    expect(parseKindConfig("Book", { fields: ["status", "author"], status_options: ["to read", "reading"], status_default: "to read", default_status: "x", title_template: "{{author}}" }))
      .toMatchObject({ fieldOptions: { status: ["to read", "reading"] }, fieldDefaults: { status: "to read", author: null }, titleTemplate: "{{author}}" });
    expect(parseKindConfig("K", { status_options: ["a"] }).fieldOptions).toEqual({});
  });
});

describe("types and values", () => {
  it("parseTypes / propType", () => {
    expect(parseTypes("not json")).toEqual({});
    expect(parseTypes('{"types":{"born":"date"}}')).toEqual({ born: "date" });
    expect(propType({ born: "date", tags: "tags", n: "number", x: "weird" }, "born")).toBe("date");
    expect(propType({ tags: "tags" }, "tags")).toBe("list");
    expect(propType({ x: "weird" }, "x")).toBe("text");
    expect(propType({}, "missing")).toBe("text");
  });
  it("toValue", () => {
    expect(toValue("text", "  hi ")).toBe("hi");
    expect(toValue("text", "  ")).toBeNull();
    expect(toValue("number", "4.5")).toBe(4.5);
    expect(toValue("number", "")).toBeNull();
    expect(toValue("checkbox", false)).toBe(false);
    expect(toValue("list", "a, ,b")).toEqual(["a", "b"]);
    expect(toValue("list", " ")).toBeNull();
    expect(toValue("date", "2026-11-19")).toBe("2026-11-19");
    expect(numberError("x")).toBe("Enter a number.");
    expect(numberError("")).toBeNull();
  });
  it("isEmptyValue", () => {
    for (const v of [undefined, null, "", "  ", []]) expect(isEmptyValue(v)).toBe(true);
    for (const v of [0, false, "a", ["a"]]) expect(isEmptyValue(v)).toBe(false);
  });
});

describe("fillTitle", () => {
  it("fills", () => {
    expect(fillTitle("{{first_name}} {{last_name}}", { first_name: "Ada", last_name: "Lovelace" })).toBe("Ada Lovelace");
    expect(fillTitle("{{a}}  {{b}}", { a: null, b: "  " })).toBe("");
    expect(fillTitle("{{x}}: {{y}}", { x: ["p", "q"] })).toBe("p, q {{y}}");
    expect(fillTitle("{{ok}}", { ok: true })).toBe("yes");
  });
  it("fills hyphenated and spaced placeholders", () => {
    expect(fillTitle("{{first-name}} {{ last name }}", { "first-name": "Ada", "last name": "Lovelace" })).toBe("Ada Lovelace");
  });
});

const R = ["kind", "up", "source", "effort", "intensity", "from"];

describe("fieldNameError", () => {
  it("checks", () => {
    expect(fieldNameError(" ", [], R)).toBe("Enter a name.");
    expect(fieldNameError("up", [], R)).toBe("ACE writes up itself.");
    expect(fieldNameError("Author", ["author"], R)).toBe("Already a field.");
    expect(fieldNameError("status", [], R)).toBeNull();
  });
  it("rejects every reserved name, any case", () => {
    for (const n of ["kind", "up", "source", "effort", "intensity", "from"]) {
      expect(fieldNameError(n, [], R)).toBe(`ACE writes ${n} itself.`);
      expect(fieldNameError(n.toUpperCase(), [], R)).toBe(`ACE writes ${n.toUpperCase()} itself.`);
    }
    expect(fieldNameError("Kind", [], R)).toBe("ACE writes Kind itself.");
  });
});

describe("draft", () => {
  it("round trips", () => {
    const fm: Record<string, unknown> = { title: "Book", folder: "Atlas/Sources/Books", is_source: true, default_map: "Reading List",
      fields: ["status", "author"], status_options: ["to read", "done"], status_default: "to read", extra: 1 };
    const d = draftFromFrontmatter(fm);
    const d0 = structuredClone(d);
    expect(d).toEqual({ folder: "Atlas/Sources/Books", isSource: true, defaultUp: "Reading List",
      fields: [{ name: "status", options: ["to read", "done"], default: "to read" }, { name: "author", options: [], default: null }],
      titleTemplate: "", template: "" });
    d.fields = d.fields.filter((f) => f.name !== "status");
    d.isSource = false;
    d.defaultUp = null;
    applyDraft(fm, d, d0);
    expect(fm).toEqual({ title: "Book", folder: "Atlas/Sources/Books", fields: ["author"], extra: 1 });
  });
  it("unchanged draft leaves lossy shapes alone", () => {
    const shapes: Record<string, unknown>[] = [
      { fields: "author" },
      { fields: ["x"], x_default: 5 },
      { default_map: "[[People]]" },
      { is_source: "yes" },
      { fields: ["x"], x_options: [1, 2] },
      { fields: ["a", "b"], a_options: ["p"], b_default: true, title_template: "{{a}}", template: "T.md" },
    ];
    for (const fm of shapes) {
      const orig = structuredClone(fm);
      const d0 = draftFromFrontmatter(fm);
      applyDraft(fm, structuredClone(d0), d0);
      expect(fm).toEqual(orig);
    }
  });
  it("changing one default changes only that key", () => {
    const fm: Record<string, unknown> = { fields: ["a", "b"], a_default: 5, b_default: "x", default_map: "[[People]]" };
    const d0 = draftFromFrontmatter(fm);
    const d = structuredClone(d0);
    d.fields[1].default = "y";
    applyDraft(fm, d, d0);
    expect(fm).toEqual({ fields: ["a", "b"], a_default: 5, b_default: "y", default_map: "[[People]]" });
  });
});

const texts = (ps: { text: string }[]) => ps.map((p) => p.text);
describe("kindProblems", () => {
  const ctx = { folderExists: (p: string) => p === "Atlas/Dots", fileExists: () => false, mapNames: ["People"], reserved: R };
  it("lists problems in order", () => {
    expect(texts(kindProblems(
      { folder: "Nope", isSource: false, defaultUp: "Ghost", fields: [{ name: "s", options: ["a"], default: "b" }], titleTemplate: "{{nick}}", template: "T.md" },
      { default_status: "x", priority_options: ["low"] }, ctx,
    ))).toEqual([
      'Folder "Nope" doesn\'t exist.',
      'Default Map "Ghost" not found.',
      'Default for s ("b") isn\'t one of its options.',
      "Title template uses {{nick}}, which isn't a field.",
      'Template file "T.md" not found.',
      "default_status looks like an old key. Rename it to status_default.",
      "priority_options is set, but priority isn't a field.",
    ]);
  });
  it("checks hyphenated and spaced placeholders", () => {
    const d = { folder: "", isSource: false, defaultUp: null, fields: [{ name: "first-name", options: [], default: null }], titleTemplate: "{{first-name}} {{ nick name }}", template: "" };
    expect(texts(kindProblems(d, {}, ctx))).toEqual(["Title template uses {{nick name}}, which isn't a field."]);
  });
  it("empty old default key says delete", () => {
    const d = { folder: "", isSource: false, defaultUp: null, fields: [], titleTemplate: "", template: "" };
    expect(texts(kindProblems(d, { default_x: "" }, ctx))).toEqual(["default_x is an old, empty key. Delete it."]);
  });
  it("blank default is unset", () => {
    const d = { folder: "", isSource: false, defaultUp: null, fields: [{ name: "s", options: ["a"], default: " " }, { name: "t", options: ["a"], default: "" }], titleTemplate: "", template: "" };
    expect(texts(kindProblems(d, {}, ctx))).toEqual([]);
  });
  it("offers a fix for missing things only", () => {
    const d = { folder: "/A/B/", isSource: false, defaultUp: "Ghost", fields: [{ name: "s", options: ["a"], default: "b" }], titleTemplate: "", template: "[[T/Book]]" };
    expect(kindProblems(d, {}, ctx).map((p) => p.fix ?? null)).toEqual([
      { type: "folder", target: "A/B" },
      { type: "map", target: "Ghost" },
      null,
      { type: "file", target: "T/Book.md" },
    ]);
  });
  it("blank folder skipped", () => {
    expect(texts(kindProblems({ folder: "", isSource: false, defaultUp: null, fields: [], titleTemplate: "", template: "" }, {}, ctx))).toEqual([]);
  });
});

describe("renamed ACE properties", () => {
  it("reserves the configured names, not the defaults", () => {
    expect(fieldNameError("type", [], ["type", "parent"])).toBe("ACE writes type itself.");
    expect(fieldNameError("kind", [], ["type", "parent"])).toBeNull();
  });
  it("flags a field that became an ACE property", () => {
    const ctx = { folderExists: () => true, fileExists: () => true, mapNames: [], reserved: ["type"] };
    const d = { folder: "", isSource: false, defaultUp: null, fields: [{ name: "Type", options: [], default: null }], titleTemplate: "", template: "" };
    expect(kindProblems(d, {}, ctx).map((p) => p.text)).toEqual([
      "Field Type is a property ACE writes itself. Rename the field, or change the property name in settings.",
    ]);
  });
});

describe("default_up", () => {
  it("is no longer read, and is flagged", () => {
    const ctx = { folderExists: () => true, fileExists: () => true, mapNames: [], reserved: R };
    const fm = { default_up: "People" };
    expect(draftFromFrontmatter(fm).defaultUp).toBeNull();
    expect(kindProblems(draftFromFrontmatter(fm), fm, ctx).map((p) => p.text)).toEqual(["default_up is an old key. Rename it to default_map."]);
    expect(kindProblems(draftFromFrontmatter({ default_map: "x" }), { default_map: "x" }, { ...ctx, mapNames: ["x"] })).toEqual([]);
  });
});

describe("old key fixes", () => {
  it("offers a rename or a delete for each old key", () => {
    const ctx = { folderExists: () => true, fileExists: () => true, mapNames: ["People"], reserved: R };
    const fm = { default_up: "People", default_status: "x", default_colour: null };
    expect(kindProblems(draftFromFrontmatter(fm), fm, ctx).map((p) => p.keyFix)).toEqual([
      { from: "default_up", to: "default_map" },
      { from: "default_status", to: "status_default" },
      { from: "default_colour", to: null },
    ]);
  });
});

describe("oldKindKey", () => {
  it("maps old keys to their current names", () => {
    expect(oldKindKey("default_up")).toBe("default_map");
    expect(oldKindKey("default_status")).toBe("status_default");
    expect(oldKindKey("default_map")).toBeNull();
    expect(oldKindKey("status_default")).toBeNull();
    expect(oldKindKey("folder")).toBeNull();
  });
});

describe("usesKind", () => {
  it("matches", () => {
    expect(usesKind("[[book]]", "Book")).toBe(true);
    expect(usesKind(["[[Book]]"], "Book")).toBe(true);
    expect(usesKind("[[Map]]", "Book")).toBe(false);
  });
});
