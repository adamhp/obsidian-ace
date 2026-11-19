import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";

const prod = process.argv[2] === "production";
const vault = process.env.ACE_VAULT ?? "/mnt/c/Users/adamp/Documents/ACE Dev Vault";
const outfile = `${vault}/.obsidian/plugins/ace-actions/main.js`;
const outdir = dirname(outfile);

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
      mkdirSync(outdir, { recursive: true });
      for (const f of ["manifest.json", "styles.css"]) copyFileSync(f, join(outdir, f));
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtins],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile,
  plugins: [copyAssets],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
