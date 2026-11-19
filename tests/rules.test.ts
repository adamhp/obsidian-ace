import { describe, it, expect } from "vitest";
import {
  parseKindConfig, linkTarget, linkList, addLink, cleanName, isTaken,
  isUnder, shouldMove, firstUrl, withFirst, ideaStatus, logStamp,
} from "../src/rules";

describe("parseKindConfig", () => {
  it("parses full config", () => {
    expect(parseKindConfig("Book", { is_source: "true", status_options: ["to read","reading","finished"], default_status: "to read", folder: "Atlas/Sources/Books/", fields: ["author"] }))
      .toEqual({ name: "Book", folder: "Atlas/Sources/Books", isSource: true, defaultStatus: "to read", statusOptions: ["to read","reading","finished"], defaultUp: null, fields: ["author"], template: null });
  });
  it("defaults", () => {
    expect(parseKindConfig("Pet", undefined)).toEqual({ name: "Pet", folder: "Atlas/Dots", isSource: false, defaultStatus: null, statusOptions: [], defaultUp: null, fields: [], template: null });
  });
  it("handles empty/null and links", () => {
    const c = parseKindConfig("Person", { default_up: "[[People]]", folder: "", status_options: null });
    expect(c.defaultUp).toBe("People");
    expect(c.folder).toBe("Atlas/Dots");
    expect(c.statusOptions).toEqual([]);
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
    expect(parseKindConfig("A", { status_options: "nope" }).statusOptions).toEqual([]);
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

describe("ideaStatus", () => {
  it("maps", () => {
    expect(ideaStatus("on")).toBe("working");
    expect(ideaStatus("ongoing")).toBe("selected");
    expect(ideaStatus("simmering")).toBe("selected");
    expect(ideaStatus("sleeping")).toBe("selected");
  });
});

describe("logStamp", () => {
  it("formats local", () => {
    expect(logStamp(new Date(2026, 10, 19, 8, 5))).toBe("[[2026-11-19]] 08:05: ");
  });
});
