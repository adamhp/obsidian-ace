import { describe, it, expect } from "vitest";
import { parseKindConfig } from "../src/rules";
import {
  parseTypes, propType, toValue, numberError, isEmptyValue, fillTitle, fieldNameError,
  draftFromFrontmatter, applyDraft, kindProblems, usesKind,
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
});

describe("fieldNameError", () => {
  it("checks", () => {
    expect(fieldNameError(" ", [])).toBe("Enter a name.");
    expect(fieldNameError("up", [])).toBe("ACE writes up itself.");
    expect(fieldNameError("Author", ["author"])).toBe("Already a field.");
    expect(fieldNameError("status", [])).toBeNull();
  });
  it("rejects every reserved name, any case", () => {
    for (const n of ["kind", "up", "source", "effort", "intensity", "from"]) {
      expect(fieldNameError(n, [])).toBe(`ACE writes ${n} itself.`);
      expect(fieldNameError(n.toUpperCase(), [])).toBe(`ACE writes ${n.toUpperCase()} itself.`);
    }
    expect(fieldNameError("Kind", [])).toBe("ACE writes Kind itself.");
  });
});

describe("draft", () => {
  it("round trips", () => {
    const fm: Record<string, unknown> = { title: "Book", folder: "Atlas/Sources/Books", is_source: true, default_up: "Reading List",
      fields: ["status", "author"], status_options: ["to read", "done"], status_default: "to read", extra: 1 };
    const d = draftFromFrontmatter(fm);
    expect(d).toEqual({ folder: "Atlas/Sources/Books", isSource: true, defaultUp: "Reading List",
      fields: [{ name: "status", options: ["to read", "done"], default: "to read" }, { name: "author", options: [], default: null }],
      titleTemplate: "", template: "" });
    d.fields = d.fields.filter((f) => f.name !== "status");
    d.isSource = false;
    d.defaultUp = null;
    applyDraft(fm, d);
    expect(fm).toEqual({ title: "Book", folder: "Atlas/Sources/Books", fields: ["author"], extra: 1 });
  });
});

describe("kindProblems", () => {
  const ctx = { folderExists: (p: string) => p === "Atlas/Dots", fileExists: () => false, mapNames: ["People"] };
  it("lists problems in order", () => {
    expect(kindProblems(
      { folder: "Nope", isSource: false, defaultUp: "Ghost", fields: [{ name: "s", options: ["a"], default: "b" }], titleTemplate: "{{nick}}", template: "T.md" },
      { default_status: "x", priority_options: ["low"] }, ctx,
    )).toEqual([
      'Folder "Nope" doesn\'t exist.',
      'Default Map "Ghost" not found.',
      'Default for s ("b") isn\'t one of its options.',
      "Title template uses {{nick}}, which isn't a field.",
      'Template file "T.md" not found.',
      "default_status looks like an old key. Rename it to status_default.",
      "priority_options is set, but priority isn't a field.",
    ]);
  });
  it("blank default is unset", () => {
    const d = { folder: "", isSource: false, defaultUp: null, fields: [{ name: "s", options: ["a"], default: " " }, { name: "t", options: ["a"], default: "" }], titleTemplate: "", template: "" };
    expect(kindProblems(d, {}, ctx)).toEqual([]);
  });
  it("blank folder skipped", () => {
    expect(kindProblems({ folder: "", isSource: false, defaultUp: null, fields: [], titleTemplate: "", template: "" }, {}, ctx)).toEqual([]);
  });
});

describe("usesKind", () => {
  it("matches", () => {
    expect(usesKind("[[book]]", "Book")).toBe(true);
    expect(usesKind(["[[Book]]"], "Book")).toBe(true);
    expect(usesKind("[[Map]]", "Book")).toBe(false);
  });
});
