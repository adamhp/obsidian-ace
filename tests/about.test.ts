import { describe, expect, it } from "vitest";
import { aboutMarkdown } from "../src/about";
import { DEFAULT_SETTINGS } from "../src/rules";

describe("aboutMarkdown", () => {
  it("uses the configured folders and intensities", () => {
    const md = aboutMarkdown({ ...DEFAULT_SETTINGS, kindsFolder: "Notes/Types", effortsFolder: "Work", intensities: ["hot", "cold"], props: { ...DEFAULT_SETTINGS.props, kind: "type" } });
    expect(md).toContain("A note's `type` property");
    expect(md).toContain("**Not allowed as field names:** `type`, `up`,");
    expect(md).toContain("`Notes/Types`");
    expect(md).toContain("`Work`");
    expect(md).toContain("(hot, cold)");
    expect(md).not.toContain(DEFAULT_SETTINGS.kindsFolder);
  });
});
