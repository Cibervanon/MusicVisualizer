import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entries = ["tests/edit.test.ts", "tests/lyrics.test.ts"];

for (const entry of entries) {
  const name = entry.replace(/^tests\//, "").replace(/\.ts$/, "");
  const outfile = resolve(`tests/.build/${name}.mjs`);
  mkdirSync(dirname(outfile), { recursive: true });

  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile,
    logLevel: "warning",
  });

  await import(pathToFileURL(outfile).href);
}
