import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { copyFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const prod = process.argv[2] === "production";
const vault = process.env.ACE_VAULT ?? "/mnt/c/Users/adamp/Documents/ACE Dev Vault";
// main.js is built at the repo root, where the release workflow picks it up.
// Outside CI it is also copied, with manifest.json and styles.css, into the dev vault.
const copyToVault = !process.env.CI;
const outdir = `${vault}/.obsidian/plugins/ace-actions`;

const REAL_VAULT = "/mnt/c/Users/adamp/Documents/GitHub/Obsidian";
const norm = (p) => resolve(p).replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
const o = norm(outdir), r = norm(REAL_VAULT);
if (o === r || o.startsWith(r + "/")) {
  throw new Error(`Refusing to build into the real vault: ${outdir}`);
}

const copyAssets = {
  name: "copy-assets",
  setup(build) {
    build.onEnd(() => {
      if (!copyToVault) return;
      mkdirSync(outdir, { recursive: true });
      for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(f, join(outdir, f));
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  plugins: [copyAssets],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
