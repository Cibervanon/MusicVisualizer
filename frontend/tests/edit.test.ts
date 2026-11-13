import assert from "node:assert/strict";

import {
  docDuration,
  duplicateSegment,
  ensureSegmentIds,
  moveSegment,
  reflowSegments,
  removeSegment,
  sourceToTimeline,
  splitSegmentAt,
  timelineToSource,
} from "../src/lib/edit";
import type { Segment } from "../src/lib/types";

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

function segment(
  id: string,
  timelineStart: number,
  duration: number,
  sourceStart: number,
  extra: Partial<Segment> = {},
): Segment {
  return {
    id,
    index: 0,
    timeline_start: timelineStart,
    timeline_end: timelineStart + duration,
    duration,
    source_start: sourceStart,
    source_end: sourceStart + duration,
    source_duration: duration,
    scene_id: "scene-1",
    scene_start: 0,
    scene_end: 30,
    cut_type: "beat",
    transition: "cut",
    ...extra,
  };
}

test("ensureSegmentIds is deterministic and unique for legacy segments", () => {
  const legacy = [
    segment("", 0, 2, 0),
    segment("", 2, 2, 2),
    segment("", 4, 2, 4),
  ] as Segment[];
  const first = ensureSegmentIds(legacy);
  const second = ensureSegmentIds(legacy);
  assert.deepEqual(
    first.map((item) => item.id),
    second.map((item) => item.id),
  );
  assert.equal(new Set(first.map((item) => item.id)).size, 3);
});

test("reflow makes timeline sequential and respects source bounds", () => {
  const result = reflowSegments(
    [
      segment("a", 0, 2, 8, { scene_start: 8, scene_end: 12 }),
      segment("b", 2, 2, 10, { scene_start: 10, scene_end: 12 }),
    ],
    10,
    12,
  );
  assert.equal(result[0].timeline_start, 0);
  assert.equal(result[0].timeline_end, 2);
  assert.equal(result[1].timeline_start, 2);
  assert.ok(result.every((item) => item.source_end <= 12 + 1e-6));
  assert.ok(result.every((item) => item.source_duration >= item.duration - 1e-6));
});

test("reflow preserves shortening the last segment", () => {
  const result = reflowSegments(
    [segment("a", 0, 5, 0), segment("b", 5, 2, 5)],
    10,
    30,
  );
  assert.equal(docDuration(result), 7);
  assert.equal(result[1].duration, 2);
  assert.equal(result[1].timeline_end, 7);
});

test("reflow trims only when the montage exceeds the target", () => {
  const result = reflowSegments(
    [segment("a", 0, 6, 0), segment("b", 6, 6, 6)],
    10,
    30,
  );
  assert.equal(docDuration(result), 10);
  assert.equal(result[0].duration, 6);
  assert.equal(result[1].duration, 4);
});

test("reflow does not touch unrelated segments", () => {
  const a = segment("a", 0, 2, 0);
  const b = segment("b", 2, 3, 10);
  const result = reflowSegments([a, b], 10, 30);
  assert.deepEqual(result[1], { ...b, index: 1, timeline_start: 2, timeline_end: 5 });
});

test("split creates two valid segments with stable unique ids", () => {
  const original = segment("seg-a", 0, 4, 2, {
    source_end: 6,
    scene_start: 2,
    scene_end: 6,
  });
  const result = splitSegmentAt([original], "seg-a", 1.5);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "seg-a");
  assert.notEqual(result[1].id, "seg-a");
  assert.equal(result[0].duration, 1.5);
  assert.equal(result[1].duration, 2.5);
  assert.equal(docDuration(result), 4);
  assert.equal(result[0].source_duration, 1.5);
  assert.equal(result[1].source_start, 3.5);
  assert.equal(result[1].source_end, 6);
  assert.ok(result[1].source_duration >= result[1].duration - 1e-6);
});

test("split refuses a cut too close to the edges", () => {
  const original = segment("a", 0, 4, 0);
  const result = splitSegmentAt([original], "a", 0.05);
  assert.equal(result.length, 1);
  assert.equal(result[0].duration, 4);
});

test("move uses the id, not the index", () => {
  const segments = [segment("a", 0, 2, 0), segment("b", 2, 2, 2), segment("c", 4, 2, 4)];
  const result = moveSegment(segments, "b", -1);
  assert.deepEqual(
    result.map((item) => item.id),
    ["b", "a", "c"],
  );
});

test("duplicate creates a new identity and respects the available duration", () => {
  const segments = [segment("a", 0, 4, 2)];
  const { segments: result, id } = duplicateSegment(segments, "a", 2.5);
  assert.ok(id);
  assert.equal(result.length, 2);
  assert.equal(result[1].id, id);
  assert.equal(result[1].duration, 2.5);
  assert.equal(result[1].source_start, 2);
});

test("duplicate refuses when there is no free duration", () => {
  const segments = [segment("a", 0, 4, 2)];
  const { id } = duplicateSegment(segments, "a", 0.05);
  assert.equal(id, null);
});

test("remove keeps selection on a valid neighbour", () => {
  const segments = [segment("a", 0, 2, 0), segment("b", 2, 2, 2), segment("c", 4, 2, 4)];
  const { segments: result, nextId } = removeSegment(segments, "b");
  assert.deepEqual(
    result.map((item) => item.id),
    ["a", "c"],
  );
  assert.equal(nextId, "c");
  const last = removeSegment(result, "c");
  assert.equal(last.nextId, "a");
});

test("timeline and master time round-trip across cuts", () => {
  const segments = [
    segment("a", 0, 2, 10),
    segment("b", 2, 2, 20),
  ];
  assert.equal(timelineToSource(segments, 0.5), 10.5);
  assert.equal(timelineToSource(segments, 3), 21);
  assert.equal(sourceToTimeline(segments, 21), 3);
  assert.equal(sourceToTimeline(segments, 99), null);
});

test("docDuration sums the real edited durations", () => {
  assert.equal(docDuration([segment("a", 0, 1.25, 0), segment("b", 1.25, 2.5, 1.25)]), 3.75);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`\n${passed} frontend edit tests passed.`);
