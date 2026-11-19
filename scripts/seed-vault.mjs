// Seeds the dev vault with fictional sample notes. Usage: npm run seed [-- --force]
// Env ACE_VAULT overrides the target. Never writes to the real vault.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const REAL = "/mnt/c/Users/adamp/Documents/GitHub/Obsidian";
const BLOCKED = ["/mnt/c/Users/adamp/Documents/DevVault"];
const DEFAULT_VAULT = "/mnt/c/Users/adamp/Documents/ACE Dev Vault";
const force = process.argv.includes("--force");

const vault = path.resolve(process.env.ACE_VAULT || DEFAULT_VAULT);
if (!fs.existsSync(REAL)) {
	console.error(`Real vault not found at "${REAL}"; cannot read Kind notes or templates.`);
	process.exit(1);
}
const within = (p, root) => {
	const a = p.toLowerCase(), b = root.toLowerCase();
	return a === b || a.startsWith(b + "/");
};
// Resolve symlinks of the deepest existing ancestor, then re-append the rest.
const real = (p) => {
	let cur = path.resolve(p);
	const rest = [];
	while (!fs.existsSync(cur)) {
		const parent = path.dirname(cur);
		if (parent === cur) break;
		rest.unshift(path.basename(cur));
		cur = parent;
	}
	return path.join(fs.realpathSync(cur), ...rest);
};
const vaultReal = real(vault);
const guarded = [REAL, ...BLOCKED].flatMap((g) => [path.resolve(g), real(g)]);
if (guarded.some((g) => within(vault, g) || within(vaultReal, g))) {
	console.error(`Refusing to seed "${vault}": it is the real vault or a protected path.`);
	process.exit(1);
}

let written = 0, skipped = 0;
function put(rel, fm, body) {
	const full = path.join(vault, rel);
	if (fs.existsSync(full) && !force) { skipped++; return; }
	fs.mkdirSync(path.dirname(full), { recursive: true });
	let text = "";
	if (fm && Object.keys(fm).length) text += `---\n${YAML.stringify(fm, { lineWidth: 0 })}---\n`;
	text += body ?? "";
	if (!text.endsWith("\n")) text += "\n";
	fs.writeFileSync(full, text);
	written++;
}
const splitFm = (t) => {
	const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	return m ? { fm: YAML.parse(m[1]) ?? {}, body: m[2] } : { fm: {}, body: t };
};
const stripTemplater = (s) => s.replace(/<%[\s\S]*?%>\n?/g, "").replace(/\n{3,}/g, "\n\n");

// ---- Kind notes + Map template from the real vault (read only) ----
const tplKind = splitFm(fs.readFileSync(`${REAL}/System/Templates/Template - Kind.md`, "utf8"));
const kindBody = stripTemplater(tplKind.body).replace(/^\n+/, "");
const tplMap = fs.readFileSync(`${REAL}/System/Templates/Template - Map.md`, "utf8");
const dotsBlock = tplMap.slice(tplMap.indexOf("## Dots")).trimEnd() + "\n";

const KEEP = ["is_source", "folder", "default_status", "status_options", "default_up", "fields", "title_template", "title"];
const kindsDir = `${REAL}/Atlas/Kinds`;
for (const f of fs.readdirSync(kindsDir).filter((x) => x.endsWith(".md")).sort()) {
	const name = f.replace(/\.md$/, "");
	const { fm } = splitFm(fs.readFileSync(path.join(kindsDir, f), "utf8"));
	const out = {};
	for (const k of KEEP) {
		const v = fm[k];
		if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
		out[k] = v;
	}
	out.title = name;
	if (out.status_options) {
		out.fields = ["status", ...(Array.isArray(out.fields) ? out.fields : []).filter((x) => x !== "status")];
		if (out.default_status !== undefined) out.status_default = out.default_status;
	}
	delete out.default_status;
	if (name === "Book") out.fields = ["status", "author"];
	if (name === "Person") { out.fields = ["first_name", "last_name", "last_contacted"]; out.title_template = "{{first_name}} {{last_name}}"; }
	if (name === "Map") out.template = "System/Templates/Map.md";
	put(`Atlas/Kinds/${f}`, out, kindBody);
}
put("System/Templates/Map.md", null, dotsBlock);
put("System/Templates/New effort.md", null, "Started {{date}}.\n\n## Goal\n\n\n\n## Next steps\n\n- [ ] \n\n## Log\n\n");
put("System/Templates/Make effort.md", null, "Started from {{note}} on {{date}}.\n\n## Next steps\n\n- [ ] \n");
// Dedicated kinds for the walkthrough (new files only; put() never overwrites without --force).
put("Atlas/Kinds/Gadget.md", { title: "Gadget", folder: "Atlas/Dots", fields: ["colour"] }, kindBody);
put("Atlas/Kinds/Label.md", { title: "Label", folder: "Atlas/Dots", fields: ["note"], title_template: "{{note}}" }, kindBody);
// Obsidian property types for the dev vault (only if absent; put() would also honour --force).
const typesPath = path.join(vault, ".obsidian/types.json");
if (!fs.existsSync(typesPath)) {
	fs.mkdirSync(path.dirname(typesPath), { recursive: true });
	fs.writeFileSync(typesPath, JSON.stringify({ types: { last_contacted: "date" } }, null, 2) + "\n");
	written++;
}

// ---- Fictional notes ----
const L = (n) => `[[${n}]]`;
const notes = [];
const add = (p, fm, body) => notes.push({ path: p, fm, body });
const mapDesc = {
	Software: "Programming tools, ideas and concepts.",
	Culinary: "Cooking, recipes and drinks.",
	People: "People worth remembering.",
	Places: "Places visited or planned.",
	Ideas: "Half-formed ideas and projects to try.",
	Quotes: "Lines worth keeping.",
	"Reading List": "Books and articles in the queue.",
	Wishlist: "Things I might buy one day.",
};
for (const [m, d] of Object.entries(mapDesc))
	add(`Atlas/Maps/${m}.md`, { kind: L("Map") }, `${d}\n\n${dotsBlock}`);

const dot = (name, kind, ups, body = "", extra = {}) =>
	add(`Atlas/Dots/${name}.md`, { kind: L(kind), ...(ups.length ? { up: ups.map(L) } : {}), ...extra }, body);
// Concepts
dot("Idempotency", "Concept", ["Software"], "An operation that gives the same result when repeated.");
dot("Event sourcing", "Concept", ["Software"], "Store changes as a log of events instead of current state.");
dot("Cache invalidation", "Concept", ["Software"], "One of the two hard problems.");
dot("Eventual consistency", "Concept", ["Software"], "Replicas converge if updates stop.");
dot("Mise en place", "Concept", ["Culinary"], "Prepare and arrange ingredients before cooking.");
dot("Maillard reaction", "Concept", ["Culinary"], "Browning that gives seared food its flavour.");
dot("Spaced repetition", "Concept", ["Ideas", "Reading List"], "Review material at growing intervals.");
// Ideas
dot("Garden planner app", "Idea", ["Ideas"], "A small app to plan beds and planting dates.", { status: "working", effort: [L("Garden Planner")] });
dot("Sourdough experiment", "Idea", ["Culinary", "Ideas"], "Try a long cold ferment.", { status: "working", effort: [L("Sourdough Starter")] });
dot("Podcast about local history", "Idea", ["Ideas"], "Interview long-time residents. Good for trying Make effort.", { status: "backlog" });
dot("Plugin for daily review", "Idea", ["Software", "Ideas"], "Summarise the day from notes.", { status: "backlog" });
dot("Trip to the coast", "Idea", ["Places", "Ideas"], "Weekend away in spring.", { status: "selected", effort: [L("Trip Planning")] });
// People
dot("Ada Lovelace", "Person", ["People"], "Early writer on computing.");
dot("Grace Hopper", "Person", ["People"], "Pioneer of compilers.");
dot("Julia Child", "Person", ["People", "Culinary"], "Made French cooking approachable.");
// Places
dot("Lisbon", "Place", ["Places"], "Hilly, tiled, sunny.");
dot("Kyoto", "Place", ["Places"], "Temples and tea.");
dot("Reykjavik", "Place", ["Places"], "Gateway to the north.");
// Drinks
dot("Old Fashioned", "Drink", ["Culinary"], "Whiskey, sugar, bitters, orange peel.");
dot("Negroni", "Drink", ["Culinary"], "Equal parts gin, vermouth, Campari.");
dot("Flat white", "Drink", ["Culinary"], "Espresso with silky milk.");
// Collections
dot("Favourite fonts", "Collection", ["Ideas"], "Typefaces I keep coming back to.");
dot("Board games", "Collection", ["Ideas"], "Ones worth owning.");
dot("Hiking trails", "Collection", ["Places"], "Trails to walk.");

// Sources
const src = (folder, name, kind, ups, extra, body = "") =>
	add(`Atlas/Sources/${folder}/${name}.md`, { kind: L(kind), ...(ups.length ? { up: ups.map(L) } : {}), ...extra }, body);
src("Books", "The Pragmatic Programmer", "Book", ["Software", "Reading List"], { status: "finished", author: "Hunt and Thomas" });
src("Books", "Designing Data-Intensive Applications", "Book", ["Software", "Reading List"], { status: "reading", author: "Martin Kleppmann" });
src("Books", "Salt Fat Acid Heat", "Book", ["Culinary", "Reading List"], { status: "to read", author: "Samin Nosrat" });
src("Articles", "Falsehoods about names", "Article", ["Software"], { status: "finished", source: "https://example.com/falsehoods-names" });
src("Articles", "The case for slow cooking", "Article", ["Culinary"], { status: "to read", source: "https://example.com/slow-cooking" });
src("Articles", "How to take smart notes", "Article", ["Ideas"], { status: "reading", source: "https://example.com/smart-notes" });
src("Videos", "Intro to event sourcing", "Video", ["Software"], { source: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
src("Videos", "Knife skills basics", "Video", ["Culinary"], { source: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });
src("Movies", "Ratatouille", "Movie", ["Culinary"], { status: "watched" });
src("Movies", "Lost in Translation", "Movie", ["Places"], { status: "to watch" });
src("Products", "Cast iron skillet", "Product", ["Wishlist", "Culinary"], { status: "want", source: "https://example.com/skillet" });
src("Products", "Mechanical keyboard", "Product", ["Wishlist", "Software"], { status: "bought", source: "https://example.com/keyboard" });
src("Quotes", "Premature optimization", "Quote", ["Quotes", "Software"], {}, "\"Premature optimization is the root of all evil.\" - Donald Knuth");
src("Recipes", "Simple tomato sauce", "Recipe", ["Culinary"], {}, "Tomatoes, olive oil, garlic, salt. Simmer 30 minutes.");
src("Tools", "Obsidian Bases", "Tool", ["Software"], { source: "https://obsidian.md" });

// Efforts
add("Efforts/Trip Planning.md", { intensity: "on", from: L("Trip to the coast") }, "Started from [[Trip to the coast]].\n\n## Next steps\n\n- [ ] Book the train\n");
add("Efforts/Garden Planner/Garden Planner.md", { intensity: "ongoing", from: L("Garden planner app") }, "## Goal\n\nPlan the beds for spring.\n\n## Next steps\n\n- [ ] Sketch layout\n\n## Log\n\n");
add("Efforts/Garden Planner/Soil Types.md", { kind: L("Concept"), up: [L("Software")] }, "Clay, sand, silt, loam. Kind is set; it must stay in Efforts when filed.");
add("Efforts/Garden Planner/Planting Calendar.md", { kind: L("Collection") }, "Sow dates by month. Kind is set; it must stay in Efforts.");
add("Efforts/Garden Planner/Watering notes.md", null, "Plain note inside an Effort folder, no kind.");
add("Efforts/Sourdough Starter.md", { intensity: "simmering", from: L("Sourdough experiment") }, "Started from [[Sourdough experiment]].\n\n## Next steps\n\n- [ ] Feed the starter\n");

// For the delete-kind step: one note writes the kind in lowercase.
add("Atlas/Dots/Gadget One.md", { kind: L("Gadget"), up: [L("Software")], colour: "red" }, "Uses the Gadget kind.\n");
add("Atlas/Dots/Gadget Two.md", { kind: "[[gadget]]", up: [L("Software")], colour: "blue" }, "Kind is written in lowercase.\n");

// Messy notes
add("Inbox/Raw thought.md", null, "Maybe write something about how notes link together.\n");
add("Inbox/Cool article.md", null, "Worth reading later: https://example.com/cool-article\n");
add("Inbox/Scalar up.md", { up: L("Software") }, "A note whose `up` is a scalar, not a list.\n");
add("Inbox/Old Fashioned.md", null, "Clashes by name with Atlas/Dots/Old Fashioned.md.\n");
add("Inbox/Meeting notes.md", null, "Agenda, decisions, actions.\n");
add("Inbox/Book idea.md", null, "A book about gardening for lazy people. Could be an Idea or an Effort.\n");
add("Inbox/Movie to see.md", null, "Recommended by a friend: a heist film.\n");
add("Atlas/Sources/Misfiled Book.md", { kind: L("Book"), status: "to read", author: "Unknown" }, "Kind is Book but it is not in Atlas/Sources/Books. Try File by kind.\n");
add("Loose note.md", null, "A note sitting in the vault root.\n");

// Home
add("Home.md", null, `# ACE Dev Vault

Try each command from the command palette (Ctrl+P, "ACE Actions: ..."). Tick the box when it behaves as expected.

## New note / New Map
- [ ] Run New note, pick Concept, type "Trial note", then pick a Map (or "(no Map)"). Expect Atlas/Dots/Trial note.md to open with kind [[Concept]].
- [ ] Run New note, pick Drink, type "Old Fashioned". Expect a refusal in the name prompt because the name clashes (Atlas/Dots/Old Fashioned.md).
- [ ] Run New note, pick Person. Expect questions for first name, last name and last contacted (a date picker). Answer "Ada", "Lovelace", a date. Expect Ada Lovelace.md with last_contacted: <date>. A note named Ada Lovelace is already seeded in Atlas/Dots, so after the last answer expect to land at the name prompt (prefilled "Ada Lovelace") because of the clash. Change it to "Ada Byron" and expect the file to be made.
- [ ] Run New note, pick Label. Its title template is {{note}}; leave the "note" answer blank. Expect the name prompt to appear, because the template comes out blank.
- [ ] Run New note, pick Person, answer the first question, then press Escape partway through the questions. Expect no note to be created anywhere.
- [ ] Run New Map, type "Hobbies", then pick a Map or "(no Map)". Expect Atlas/Maps/Hobbies.md with kind [[Map]] and a Dots base.

## Set kind
Each run asks: kind, then Map (pick one or "(no Map)"), then a link (source kinds without a source), then the kind's fields (status, author, ...; a field already set on the note is not asked).
- [ ] Open [[Inbox/Cool article]] then Set kind then Article. Expect the link pre-filled from the URL in the text, status choices led by "to read", and the note moved to Atlas/Sources/Articles.
- [ ] Open [[Inbox/Raw thought]] then Set kind then Concept. Expect kind [[Concept]] and a move to Atlas/Dots.
- [ ] Open [[Inbox/Scalar up]] then Set kind then Concept, pick "(no Map)". Expect up to stay as a one-item list ["[[Software]]"].
- [ ] Open [[Inbox/Old Fashioned]] then Set kind then Drink. Expect kind set but the file stays in Inbox, with a notice "not moved: Atlas/Dots/Old Fashioned.md already exists".
- [ ] Open [[Inbox/Book idea]] then Set kind then Book. Expect an empty author field and a move to Atlas/Sources/Books.
- [ ] Open [[Ratatouille]] (it already has status: watched), then Set kind then Book. Expect status not to be asked again and to stay "watched", while author is asked.
- [ ] Open [[Inbox/Meeting notes]], run Set kind then Concept, then press Escape partway through (after the Map, or midway through the field questions). Expect no notice, no move, and no property added to the note.
- [ ] Open [[Loose note]] then Set kind then Person. Expect it to be filed into the Person kind folder (Atlas/Dots unless the kind says otherwise).

## Add to Map
- [ ] Open [[Inbox/Meeting notes]] then Add to Map then Software. Expect up: ["[[Software]]"].
- [ ] Open [[Idempotency]] (up is already [[Software]]) then Add to Map then Software. Expect a notice "already on Software" and up unchanged (no duplicate).
- [ ] Open [[Idempotency]] then Add to Map then Reading List. Expect [[Reading List]] appended after [[Software]].

## File by kind
- [ ] Open [[Atlas/Sources/Misfiled Book]] then File by kind. Expect it moved to Atlas/Sources/Books.
- [ ] Open [[Efforts/Garden Planner/Soil Types]] then File by kind. Expect a notice that it stays in Efforts/Garden Planner.

## Make effort
- [ ] Open [[Podcast about local history]] then Make effort then on, accept the name prompt ("... (effort)"). Expect a new Effort in Efforts with from set, and the Idea gets an effort link and status working.
- [ ] Open [[Inbox/Movie to see]] then Make effort then simmering. Expect intensity set and the note moved to Efforts.

## New effort
Asks name, then intensity, then shape.
- [ ] Run New effort, name "Learn Portuguese", sleeping, Single note. Expect Efforts/Learn Portuguese.md.
- [ ] Run New effort, name "Home Studio", on, Folder. Expect Efforts/Home Studio/Home Studio.md.

## Log
- [ ] Open [[Efforts/Garden Planner/Garden Planner]], put the cursor under "## Log", run Log. Expect a time stamp line.

## Edit kinds
Open Settings, then ACE Actions, then Kinds. Each kind has an Edit button; clicking the name opens the Kind note.
- [ ] Edit Book: add the option \`abandoned\` to status, press Save, then open the Book note and expect \`abandoned\` in status_options and every other key and the body unchanged.
- [ ] Edit Book, change the folder, press Cancel. Expect the Book note unchanged.
- [ ] Press New kind, name it "Recipe Card". Expect the editor to open on a new Kind note. Press Rename, name it "Card". Expect Atlas/Kinds/Card.md.
- [ ] Open Card in the editor, press Delete. Expect a confirmation saying 0 notes use it, then the Notice "Deleted the Card kind; 0 notes now have no kind." and Card.md in the trash.
- [ ] Open Gadget in the editor and check its usage: two seeded notes use it ([[Gadget One]] written \`[[Gadget]]\` and [[Gadget Two]] written \`[[gadget]]\`). Press Delete. Expect the confirmation to say 2 notes use it, then the Notice "Deleted the Gadget kind; 2 notes now have no kind." Open both notes and expect only the \`kind\` property gone (up, colour and the body unchanged). Gadget.md is in the trash.
- [ ] Open the Map kind in the editor. Expect no Rename or Delete buttons and the line "Map is part of ACE and can't be renamed or deleted." Other edits still save.
- [ ] Press the folder button at the top right of Kinds (Create missing folders). Expect a notice listing the kind folders it created (e.g. Atlas/Sources/Methods), and the ⚠ counts for missing folders to clear. Press it again: "Every kind's folder already exists."
- [ ] Open the Gadget Kind note and add \`default_up: Tools Map\` to its properties by hand. Then edit Gadget, set Folder to \`Atlas/Gadgets\` and Template to \`System/Templates/Gadget\`. Expect three Problems, each with a Create button. Press each: expect the folder, the Map note (in Atlas/Maps, with a Dots view) and an empty template file to appear, and each Problem to disappear. Cancel the editor; the Kind note is unchanged (remove \`default_up\` by hand afterwards if you like).
- [ ] Open the Book note, add \`default_status: x\` by hand to its properties, then open the Book editor. Expect the Problems line "default_status looks like an old key. Rename it to status_default." Remove the key afterwards.

## Settings
Open Settings, then ACE Actions. Change one thing at a time and put it back afterwards.
- [ ] Change Efforts folder to "Projects", run New effort (any name, any intensity, Single note). Expect Projects/<name>.md. Then change Efforts folder back to "Efforts".
- [ ] Set New effort template to \`System/Templates/New effort.md\` and Make effort template to \`System/Templates/Make effort.md\`. Run New effort: expect the body to start "Started <today>.". Run Make effort on an Atlas note: expect "Started from [[<note>]] on <today>.".
- [ ] Set New effort template to \`System/Templates/Missing.md\`. Expect a "file not found" row with Create file; New effort still uses the built-in text. Press Create file: the file appears with the built-in text and the row goes. Delete that file and set the template back.
- [ ] Press Create starter kinds. Expect the notice "No kinds created; all 8 already there".
- [ ] First run: set Kinds folder to \`Test/Kinds\` (empty). Press Create starter kinds. Expect "Created 8 kinds (…, Map)". Run New Map and expect the note in Atlas/Maps with a "## Dots" block. Then set Kinds folder back to \`Atlas/Kinds\`. The Test folder can be deleted.
- [ ] Under Intensities, press + and add \`paused\`, drag it to the top, run Make effort and expect \`paused\` listed first. Then delete it.
- [ ] Change Time format to "HH:mm:ss", run Log in an Effort. Expect the time stamp to show seconds. Then change it back to "HH:mm".
- [ ] Open [[Plugin for daily review]], run Make effort and pick the first intensity. Expect a new Effort in Efforts, an effort link on the Idea, and its status unchanged.

## Existing structure
- [[Software]], [[Culinary]], [[People]], [[Places]], [[Ideas]], [[Quotes]], [[Reading List]], [[Wishlist]]
- Efforts: [[Trip Planning]], [[Garden Planner]], [[Sourdough Starter]]
`);

for (const n of notes) put(n.path, n.fm, n.body);
console.log(`Seeded ${vault}: ${written} files written, ${skipped} skipped${force ? " (force)" : ""}.`);
