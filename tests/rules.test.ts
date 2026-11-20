import { describe, it, expect } from "vitest";
import {
  parseKindConfig, linkTarget, linkList, addLink, cleanName, isTaken,
  isUnder, shouldMove, firstUrl, withFirst,
  normalizeSettings, propNameError, folderSetting, DEFAULT_SETTINGS, parseIntensities, intensityError, fillTemplate,
} from "../src/rules";

describe("parseKindConfig", () => {
  it("parses full config", () => {
    expect(parseKindConfig("Book", { is_source: "true", status_options: ["to read","reading","finished"], default_status: "to read", folder: "Atlas/Sources/Books/", fields: ["author"] }))
      .toEqual({ name: "Book", folder: "Atlas/Sources/Books", isSource: true, defaultUp: null, fields: ["author"], template: null, titleTemplate: null, fieldOptions: {}, fieldDefaults: { author: null } });
  });
  it("defaults", () => {
    expect(parseKindConfig("Pet", undefined)).toEqual({ name: "Pet", folder: "Atlas/Dots", isSource: false, defaultUp: null, fields: [], template: null, titleTemplate: null, fieldOptions: {}, fieldDefaults: {} });
  });
  it("handles empty/null and links", () => {
    const c = parseKindConfig("Person", { default_up: "[[People]]", folder: "", status_options: null });
    expect(c.defaultUp).toBe("People");
    expect(c.folder).toBe("Atlas/Dots");
    expect(c.fieldOptions).toEqual({});
  });
  it("template", () => {
    expect(parseKindConfig("Map", { template: "[[System/Templates/Map]]" }).template).toBe("System/Templates/Map.md");
    expect(parseKindConfig("Map", { template: "System/Templates/Map.md" }).template).toBe("System/Templates/Map.md");
  });
  it("isSource boolean/case", () => {
    expect(parseKindConfig("A", { is_source: true }).isSource).toBe(true);
    expect(parseKindConfig("A", { is_source: "TRUE" }).isSource).toBe(true);
    expect(parseKindConfig("A", { is_source: "no" }).isSource).toBe(false);
  });
  it("drops empties in arrays", () => {
    expect(parseKindConfig("A", { fields: ["x", "", null], status_options: "nope" }).fields).toEqual(["x"]);
    expect(parseKindConfig("A", { fields: ["status"], status_options: "nope" }).fieldOptions).toEqual({});
  });
});

describe("linkTarget", () => {
  it("strips", () => {
    expect(linkTarget(["[[Book|b]]"])).toBe("Book");
    expect(linkTarget("[[Atlas/Kinds/Idea.md]]")).toBe("Idea");
    expect(linkTarget("[[Note#Head]]")).toBe("Note");
    expect(linkTarget("Plain")).toBe("Plain");
  });
  it("null cases", () => {
    expect(linkTarget(null)).toBeNull();
    expect(linkTarget("")).toBeNull();
    expect(linkTarget([])).toBeNull();
  });
});

describe("linkList", () => {
  it("normalises", () => {
    expect(linkList("[[Engineering]]")).toEqual(["[[Engineering]]"]);
    expect(linkList(null)).toEqual([]);
    expect(linkList(["[[A]]", "", "B"])).toEqual(["[[A]]", "[[B]]"]);
  });
});

describe("addLink", () => {
  it("adds only if missing", () => {
    expect(addLink(["[[Software|sw]]"], "Software")).toEqual(["[[Software|sw]]"]);
    expect(addLink("[[A]]", "B")).toEqual(["[[A]]", "[[B]]"]);
  });
});

describe("cleanName", () => {
  it("strips illegal chars and trims", () => {
    expect(cleanName("  a/b: [c]#?  ")).toBe("ab c");
    expect(cleanName(' x*"<>|^y ')).toBe("xy");
  });
});

describe("isTaken", () => {
  it("case-insensitive", () => {
    expect(isTaken("acid", ["ACID", "Other"])).toBe(true);
    expect(isTaken("new", ["ACID"])).toBe(false);
  });
});

describe("isUnder", () => {
  it("prefix with slash", () => {
    expect(isUnder("Efforts/X.md", "Efforts")).toBe(true);
    expect(isUnder("Efforts.md", "Efforts")).toBe(false);
  });
});

describe("shouldMove", () => {
  it("rules", () => {
    expect(shouldMove("Inbox/X.md", "Atlas/Dots")).toBe(true);
    expect(shouldMove("Atlas/Dots/X.md", "Atlas/Dots")).toBe(false);
    expect(shouldMove("Efforts/Career/X.md", "Atlas/Dots")).toBe(false);
    expect(shouldMove("Efforts.md", "Atlas/Dots")).toBe(true);
    expect(shouldMove("Atlas/Sources/X.md", "Atlas/Sources/Books")).toBe(true);
    expect(shouldMove("X.md", "Atlas/Dots")).toBe(true);
  });
});

describe("firstUrl", () => {
  it("skips frontmatter", () => {
    expect(firstUrl("---\nsource: https://no.example\n---\nsee https://yes.example/a).")).toBe("https://yes.example/a");
    expect(firstUrl("none")).toBeNull();
  });
});

describe("withFirst", () => {
  it("moves to front", () => {
    expect(withFirst(["a","b","c"], "c")).toEqual(["c","a","b"]);
    expect(withFirst(["a"], "z")).toEqual(["a"]);
    expect(withFirst(["a"], null)).toEqual(["a"]);
  });
});

describe("nested YAML links", () => {
  it("linkTarget reads nested one-element array", () => {
    expect(linkTarget([["Book"]])).toBe("Book");
    expect(linkTarget([["Book|b"]])).toBe("Book");
  });
  it("linkList reads nested up", () => {
    expect(linkList([["Software"]])).toEqual(["[[Software]]"]);
    expect(linkList([["Software"], "[[Ideas|i]]"])).toEqual(["[[Software]]", "[[Ideas|i]]"]);
  });
  it("linkList keeps unknown items unchanged", () => {
    const odd = { a: 1 };
    const multi = ["x", "y"];
    expect(linkList(["[[A]]", odd, multi])).toEqual(["[[A]]", odd, multi]);
  });
  it("mixed alias and plain", () => {
    expect(linkList(["[[A|a]]", "B", ["C"]])).toEqual(["[[A|a]]", "[[B]]", "[[C]]"]);
  });
  it("addLink keeps unknown items and dedupes nested", () => {
    const odd = { a: 1 };
    expect(addLink([odd, ["Software"]], "Software")).toEqual([odd, "[[Software]]"]);
    expect(addLink([odd], "B")).toEqual([odd, "[[B]]"]);
  });
});

describe("parseKindConfig folder slashes", () => {
  it("strips leading and trailing slashes", () => {
    expect(parseKindConfig("A", { folder: "/Atlas/Dots/" }).folder).toBe("Atlas/Dots");
    expect(parseKindConfig("A", { folder: "/Atlas/Dots" }).folder).toBe("Atlas/Dots");
  });
});

describe("settings", () => {
  it("normalizeSettings", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ kindsFolder: "/Notes/Kinds/", effortsFolder: "", atlasFolder: 7, intensities: "on, , ongoing, bad:one, x[y]" }))
      .toMatchObject({ kindsFolder: "Notes/Kinds", effortsFolder: "Efforts", atlasFolder: "Atlas", intensities: ["on", "ongoing"] });
    expect(normalizeSettings({ intensities: [] }).intensities).toEqual(["on", "ongoing", "simmering", "sleeping"]);
    expect(normalizeSettings({ newEffortText: "old", newEffortTemplate: " T/New.md ", logFormat: "" })).not.toHaveProperty("newEffortText");
    expect(normalizeSettings({ newEffortTemplate: " T/New.md ", logFormat: "" })).toMatchObject({ newEffortTemplate: "T/New.md", makeEffortTemplate: "", logFormat: "[[{{date}}]] {{time}}: " });
  });
  it("normalizeSettings property names", () => {
    const d = DEFAULT_SETTINGS.props;
    expect(normalizeSettings({}).props).toEqual(d);
    expect(normalizeSettings({ props: { kind: " type ", up: "parent" } }).props).toEqual({ ...d, kind: "type", up: "parent" });
    // Any bad or repeated name puts all six back to the defaults.
    expect(normalizeSettings({ props: { kind: "up" } }).props).toEqual(d);
    expect(normalizeSettings({ props: { kind: "" } }).props).toEqual(d);
    expect(normalizeSettings({ props: { kind: "a:b" } }).props).toEqual(d);
    expect(normalizeSettings({ props: { kind: 7 } }).props).toEqual(d);
    expect(normalizeSettings({ props: "x" }).props).toEqual(d);
  });
  it("propNameError", () => {
    expect(propNameError(" ", [])).toBe("Enter a name.");
    expect(propNameError("a[b", [])).toContain("Avoid the characters");
    expect(propNameError("Up", ["up"])).toBe('"Up" is already used by another ACE property.');
    expect(propNameError("note type", ["up"])).toBeNull();
  });
  it("normalizeSettings bad input", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ kindsFolder: null }).kindsFolder).toBe(DEFAULT_SETTINGS.kindsFolder);
  });
  it("folderSetting cleans separators", () => {
    expect(folderSetting("Notes\\Kinds", "D")).toBe("Notes/Kinds");
    expect(folderSetting("//A//B///C//", "D")).toBe("A/B/C");
    expect(folderSetting("\\\\", "D")).toBe("D");
  });
  it("normalizeSettings keeps array items with commas whole", () => {
    expect(normalizeSettings({ intensities: [" a,b ", "c", 5, "d{"] }).intensities).toEqual(["a,b", "c"]);
  });
  it("parseIntensities", () => {
    expect(parseIntensities(" a ,b,,c|d ")).toEqual(["a", "b"]);
    expect(parseIntensities("a{b,c}d,e#f,g,a/b")).toEqual(["g", "a/b"]);
  });
  it("kind folder and move params", () => {
    expect(parseKindConfig("X", {}, "Notes/Dots").folder).toBe("Notes/Dots");
    expect(shouldMove("Work/X.md", "Atlas/Dots", "Work")).toBe(false);
    expect(shouldMove("Efforts/X.md", "Atlas/Dots", "Work")).toBe(true);
  });
  it("intensityError", () => {
    expect(intensityError("  ", ["on"])).toBe("Enter a name.");
    expect(intensityError("a#b", ["on"])).toBe("Avoid the characters [ ] { } : # |.");
    expect(intensityError(" ON ", ["on"])).toBe("Already in the list.");
    expect(intensityError("paused", ["on"])).toBeNull();
  });
  it("fillTemplate", () => {
    expect(fillTemplate("[[{{date}}]] {{time}}: {{x}}", { date: "2026-11-19", time: "08:05" })).toBe("[[2026-11-19]] 08:05: {{x}}");
  });
});
