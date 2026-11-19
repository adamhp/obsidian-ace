// Read-only check of the dev vault: every frontmatter block must parse as
// strict YAML, and no Templater syntax may leak into notes.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const vault = process.env.ACE_VAULT || "/mnt/c/Users/adamp/Documents/ACE Dev Vault";

function* walk(dir) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === ".obsidian") continue;
		const p = join(dir, e.name);
		if (e.isDirectory()) yield* walk(p);
		else if (e.name.endsWith(".md")) yield p;
	}
}

let files = 0, withFm = 0;
const failures = [];
for (const p of walk(vault)) {
	files++;
	const text = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
	if (text.includes("<%")) failures.push(`${p}: Templater syntax "<%"`);
	if (text.startsWith("---\n")) {
		const end = text.indexOf("\n---", 4);
		if (end === -1) {
			failures.push(`${p}: unterminated frontmatter`);
			continue;
		}
		withFm++;
		try {
			parse(text.slice(4, end), { strict: true });
		} catch (e) {
			failures.push(`${p}: ${e.message.split("\n")[0]}`);
		}
	}
}
console.log(`files: ${files}, with frontmatter: ${withFm}, failures: ${failures.length}`);
for (const f of failures) console.log("FAIL " + f);
process.exit(failures.length ? 1 : 0);
