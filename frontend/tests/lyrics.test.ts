import assert from "node:assert/strict";

import { parseLyricsImport, parseLrc, parsePlainText, parseSrt } from "../src/lib/lyrics";

let failures = 0;
let passed = 0;

function test(name: string, run: () => void) {
  try {
    run();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

test("SRT with comma milliseconds keeps real times", () => {
  const lines = parseSrt(
    [
      "1",
      "00:00:00,000 --> 00:00:02,500",
      "Hola mundo",
      "",
      "2",
      "00:00:03,000 --> 00:00:05,000",
      "Segunda linea importada",
    ].join("\n"),
    30,
  );
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], { start: 0, end: 2.5, text: "Hola mundo" });
  assert.deepEqual(lines[1], { start: 3, end: 5, text: "Segunda linea importada" });
});

test("SRT accepts dot separators, CRLF, tags and multiline text", () => {
  const lines = parseSrt(
    "1\r\n00:00:01.250 --> 00:00:03.750\r\n<i>Primera</i>\r\nlínea\r\n",
    10,
  );
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], { start: 1.25, end: 3.75, text: "Primera línea" });
});

test("SRT without valid time blocks yields nothing", () => {
  assert.deepEqual(parseSrt("no hay tiempos aquí", 10), []);
});

test("LRC parses minutes, fractional seconds and multiple tags", () => {
  const lines = parseLrc(
    ["[00:00.00]Primera linea", "[00:04.50][00:09.25]Estribillo"].join("\n"),
    12,
  );
  assert.deepEqual(
    lines.map((line) => [line.start, line.text]),
    [
      [0, "Primera linea"],
      [4.5, "Estribillo"],
      [9.25, "Estribillo"],
    ],
  );
});

test("LRC derives end from next line and clamps the last one", () => {
  const lines = parseLrc("[00:00.00]A\n[00:02.00]B", 30);
  assert.equal(lines[0].end, 2);
  assert.equal(lines[1].end, 6);
});

test("plain text distributes the fragment and splits long lines", () => {
  const text = "Una frase corta\n\nOtra frase que es bastante más larga que el límite de cuarenta y dos caracteres para partirse";
  const lines = parsePlainText(text, 20);
  assert.equal(lines.length, 4);
  assert.equal(lines[0].start, 0);
  assert.equal(lines[lines.length - 1].end, 20);
  for (const line of lines) {
    assert.ok(line.text.length <= 42, `line too long: ${line.text}`);
    assert.ok(line.end > line.start);
  }
});

test("import normalization clamps to duration and trims overlaps", () => {
  const lines = parseSrt(
    [
      "1",
      "00:00:00,000 --> 00:00:06,000",
      "Larga",
      "",
      "2",
      "00:00:04,000 --> 00:00:08,000",
      "Solapada",
    ].join("\n"),
    5,
  );
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.end <= 5));
  assert.ok(lines[0].end <= lines[1].start);
});

test("parseLyricsImport dispatches by kind", () => {
  assert.equal(parseLyricsImport("[00:01.00]Hola", "lrc", 10).length, 1);
  assert.equal(parseLyricsImport("Hola", "text", 10).length, 1);
  assert.equal(
    parseLyricsImport("1\n00:00:01,000 --> 00:00:02,000\nHola", "srt", 10).length,
    1,
  );
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`\n${passed} frontend lyrics tests passed.`);
