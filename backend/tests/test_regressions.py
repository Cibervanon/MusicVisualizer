"""Regression tests for the correctness fixes.

Run from `backend/`:
    .venv\\Scripts\\python.exe -m unittest discover -s tests -v
"""

from __future__ import annotations

import asyncio
import shutil
import unittest

import numpy as np

from app.analysis.audio_analyzer import _norm
from app.api.routes_project import edit_patch
from app.core.errors import ValidationError
from app.core.paths import project_layout
from app.core.util import write_json
from app.editing.planner import plan_edit, validate_edl
from app.jobs.manager import JobStore
from app.lyrics.service import save_lyrics
from app.media.render import _build_graph, render_identity
from app.models.schemas import EditPatch
from app.project.manager import (
    add_render,
    create_project,
    edit_path,
    load_project,
    mutate_project,
)


def _segment(segment_id: str, duration: float, source_start: float = 0.0) -> dict:
    return {
        "id": segment_id,
        "index": 0,
        "timeline_start": 0.0,
        "timeline_end": duration,
        "duration": duration,
        "source_start": source_start,
        "source_end": source_start + duration,
        "source_duration": duration,
        "scene_id": "scene-1",
        "scene_start": 0.0,
        "scene_end": 30.0,
        "cut_type": "beat",
        "transition": "cut",
    }


class ProjectCase(unittest.TestCase):
    def setUp(self) -> None:
        self.project = create_project("regression test")

        def configure(project: dict) -> None:
            project["fragment"] = {"start": 0.0, "end": 30.0, "duration": 30.0}

        mutate_project(self.project["id"], configure)
        write_json(
            project_layout(self.project["id"])["analysis"] / "scene_library.json",
            {"duration": 30.0, "scenes": []},
        )

    def tearDown(self) -> None:
        shutil.rmtree(project_layout(self.project["id"])["root"], ignore_errors=True)


class PathSafetyTests(ProjectCase):
    def test_edit_path_rejects_traversal(self) -> None:
        for bad in ("../../project", "..\\..\\project", "edit/../../x", "", ".hidden"):
            with self.subTest(bad=bad):
                with self.assertRaises(ValidationError):
                    edit_path(self.project["id"], bad)

    def test_edit_path_accepts_normal_id(self) -> None:
        layout = project_layout(self.project["id"])
        write_json(layout["edits"] / "edit_01_clean.json", {"id": "edit_01_clean"})
        path = edit_path(self.project["id"], "edit_01_clean")
        self.assertEqual(path.name, "edit_01_clean.json")


class AudioTests(unittest.TestCase):
    def test_beat_strength_is_normalized_as_a_vector(self) -> None:
        raw = np.array([0.05, 0.25, 0.9, 1.0])
        normalized = _norm(raw, 99.0)
        self.assertGreater(len(set(np.round(normalized, 4))), 1)
        # La regresión era normalizar cada escalar por separado: siempre 1.0.
        self.assertEqual(float(_norm(np.array([0.25]), 99.0)[0]), 1.0)


class LyricsTests(ProjectCase):
    def test_save_lyrics_keeps_concurrent_renders(self) -> None:
        def add_render(project: dict) -> None:
            project["renders"] = [{"id": "r_existing", "type": "final"}]

        mutate_project(self.project["id"], add_render)
        save_lyrics(
            self.project["id"],
            [{"start": 0.0, "end": 1.5, "text": "hola"}],
            source="manual",
        )
        stored = load_project(self.project["id"])
        self.assertEqual(stored["renders"][0]["id"], "r_existing")
        self.assertEqual(stored["lyrics"]["lines"][0]["text"], "hola")


class EditPatchTests(ProjectCase):
    def _write_edl(self, duration: float, segments: list[dict]) -> str:
        edit_id = "edit_01_test"
        layout = project_layout(self.project["id"])
        write_json(
            layout["edits"] / f"{edit_id}.json",
            {
                "schema_version": 1,
                "id": edit_id,
                "project_id": self.project["id"],
                "duration": duration,
                "transition": {"type": "cut", "duration": 0.0},
                "segments": segments,
                "grade": {},
                "effects": {},
                "stats": {},
            },
        )
        return edit_id

    def test_shortening_last_segment_is_persisted(self) -> None:
        edit_id = self._write_edl(
            10.0,
            [
                _segment("a", 5.0, 0.0),
                _segment("b", 5.0, 5.0),
            ],
        )
        body = EditPatch(segments=[_segment("a", 5.0, 0.0), _segment("b", 2.0, 5.0)])
        result = asyncio.run(edit_patch(self.project["id"], edit_id, body))
        edit = result["edit"]
        self.assertAlmostEqual(edit["duration"], 7.0, places=3)
        self.assertAlmostEqual(edit["segments"][1]["duration"], 2.0, places=3)
        self.assertEqual(edit["segments"][1]["id"], "b")
        self.assertAlmostEqual(edit["segments"][1]["timeline_start"], 5.0, places=3)

    def test_source_bounds_respect_scene_and_master(self) -> None:
        segment = _segment("a", 1.0, 0.0)
        segment.update({"scene_start": 10.0, "scene_end": 12.0, "source_start": 11.5, "source_end": 15.0})
        edit_id = self._write_edl(5.0, [segment])
        body = EditPatch(segments=[segment])
        result = asyncio.run(edit_patch(self.project["id"], edit_id, body))
        saved = result["edit"]["segments"][0]
        self.assertGreaterEqual(saved["source_start"], 10.0)
        self.assertLessEqual(saved["source_end"], 12.0 + 1e-6)
        self.assertGreaterEqual(saved["source_duration"], saved["duration"] - 1e-6)

    def test_rejects_growing_beyond_audio_fragment(self) -> None:
        edit_id = self._write_edl(5.0, [_segment("a", 5.0, 0.0)])
        body = EditPatch(segments=[_segment("a", 40.0, 0.0)])
        with self.assertRaises(ValidationError):
            asyncio.run(edit_patch(self.project["id"], edit_id, body))

    def test_duplicate_ids_are_replaced(self) -> None:
        edit_id = self._write_edl(4.0, [_segment("a", 2.0), _segment("a", 2.0)])
        body = EditPatch(segments=[_segment("a", 2.0), _segment("a", 2.0)])
        result = asyncio.run(edit_patch(self.project["id"], edit_id, body))
        ids = [s["id"] for s in result["edit"]["segments"]]
        self.assertEqual(len(ids), len(set(ids)))


class PlannerTests(unittest.TestCase):
    def test_segments_have_unique_ids_and_valid_bounds(self) -> None:
        beats = [
            {
                "t": round(index * 0.5, 3),
                "index": index,
                "is_downbeat": index % 4 == 0,
                "strength": 0.9 if index % 4 == 0 else 0.45,
                "bands": {"kick": 0.6},
            }
            for index in range(40)
        ]
        audio = {
            "tempo": {"bpm": 120.0, "confidence": 0.9},
            "beats": beats,
            "sections": [{"start": 0.0, "end": 20.0, "label": "verse", "intensity": 0.6}],
            "events": [],
        }
        scenes = [
            {
                "id": f"scene-{index}",
                "start": index * 5.0,
                "end": index * 5.0 + 5.0,
                "duration": 5.0,
                "motion": 0.5,
                "quality": 0.8,
            }
            for index in range(10)
        ]
        edl = plan_edit(
            project_id="p",
            edit_id="edit_01_test",
            audio=audio,
            scene_library={"scenes": scenes},
            style_id="cinematic",
            duration=10.0,
            seed=7,
            format="9:16",
            width=1080,
            height=1920,
            fps=30,
            master_rel="master/master.mp4",
            audio_rel="analysis/audio/fragment.wav",
        )
        self.assertEqual(validate_edl(edl, 50.0), [])
        ids = [segment["id"] for segment in edl["segments"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertAlmostEqual(sum(s["duration"] for s in edl["segments"]), 10.0, places=2)

    def test_cut_graph_trims_to_shot_not_source_duration(self) -> None:
        edl = {
            "duration": 1.5,
            "transition": {"type": "cut", "duration": 0.0},
            "segments": [
                {
                    "duration": 1.5,
                    "source_start": 2.0,
                    "source_duration": 3.0,
                    "source_end": 5.0,
                }
            ],
            "effects": {},
            "grade": {},
            "allowed_effects": [],
            "volume": 1.0,
        }
        graph = _build_graph(
            edl,
            out_width=1080,
            out_height=1920,
            fps=30,
            audio_index=1,
            ass_path=None,
        )
        self.assertIn("trim=start=0:end=1.5000", graph)


class RenderIdentityTests(unittest.TestCase):
    def test_render_ids_are_project_scoped(self) -> None:
        first, _ = render_identity("project-a", "edit_01_cinematic", False)
        second, _ = render_identity("project-b", "edit_01_cinematic", False)
        self.assertNotEqual(first, second)
        preview, _ = render_identity("project-a", "edit_01_cinematic", True)
        self.assertNotEqual(first, preview)


class RenderStorageTests(ProjectCase):
    def test_legacy_render_is_superseded_and_its_file_removed(self) -> None:
        layout = project_layout(self.project["id"])
        legacy_file = layout["renders"] / "edit_01_preview.mp4"
        legacy_file.parent.mkdir(parents=True, exist_ok=True)
        legacy_file.write_bytes(b"old")
        new_file = layout["renders"] / "r_new_edit_01_preview.mp4"
        new_file.write_bytes(b"new")
        legacy = {
            "id": "r_edit_01_preview",
            "edit_id": "edit_01",
            "type": "preview",
            "path": "renders/edit_01_preview.mp4",
        }
        mutate_project(
            self.project["id"],
            lambda project: project.update({"renders": [legacy]}),
        )
        fresh = {
            "id": "r_new_edit_01_preview",
            "edit_id": "edit_01",
            "type": "preview",
            "path": "renders/r_new_edit_01_preview.mp4",
        }
        add_render(self.project["id"], fresh)
        stored = load_project(self.project["id"])
        self.assertEqual([r["id"] for r in stored["renders"]], ["r_new_edit_01_preview"])
        self.assertFalse(legacy_file.exists())
        self.assertTrue(new_file.exists())

    def test_replacing_same_id_removes_previous_file(self) -> None:
        layout = project_layout(self.project["id"])
        old_file = layout["renders"] / "old.mp4"
        old_file.parent.mkdir(parents=True, exist_ok=True)
        old_file.write_bytes(b"old")
        new_file = layout["renders"] / "new.mp4"
        new_file.write_bytes(b"new")
        add_render(
            self.project["id"],
            {"id": "r_same", "edit_id": "edit_01", "type": "final", "path": "renders/old.mp4"},
        )
        add_render(
            self.project["id"],
            {"id": "r_same", "edit_id": "edit_01", "type": "final", "path": "renders/new.mp4"},
        )
        stored = load_project(self.project["id"])
        self.assertEqual([r["path"] for r in stored["renders"]], ["renders/new.mp4"])
        self.assertFalse(old_file.exists())
        self.assertTrue(new_file.exists())


class CancellationTests(unittest.TestCase):
    def test_cancel_is_not_overwritten_by_done(self) -> None:
        async def scenario() -> str:
            store = JobStore()
            started = asyncio.Event()

            async def runner() -> None:
                started.set()
                await asyncio.sleep(0.05)
                await store.update(job["id"], status="done", progress=1.0)

            job = await store.create("render", "project")
            await store.start(job["id"], runner)
            await started.wait()
            await store.cancel(job["id"])
            await asyncio.sleep(0.2)
            final = await store.get(job["id"])
            return final["status"]

        self.assertEqual(asyncio.run(scenario()), "cancelled")


if __name__ == "__main__":
    unittest.main()
