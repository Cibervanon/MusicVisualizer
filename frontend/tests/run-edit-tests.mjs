import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = resolve("tests/.build/edit.test.mjs");
mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: ["tests/edit.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  logLevel: "warning",
});

await import(pathToFileURL(outfile).href);
