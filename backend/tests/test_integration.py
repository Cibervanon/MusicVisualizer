r"""Integration tests for the full render pipeline.

Tests the complete pipeline: audio analysis -> video analysis -> planning -> render -> validation.
Every fixture is generated on the fly with FFmpeg, so the suite needs no committed media.

Run from `backend/`:
    .venv\Scripts\python.exe -m pytest tests/test_integration.py -v
    .venv\Scripts\python.exe -m unittest tests.test_integration -v
"""

from __future__ import annotations

import asyncio
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Any

from app.analysis.audio_analyzer import analyze_audio_file, extract_fragment
from app.analysis.video_analyzer import analyze_and_cache
from app.core.ffmpeg import probe
from app.core.paths import project_layout
from app.editing.generator import generate_versions
from app.editing.planner import validate_edl
from app.media.master import ensure_master
from app.media.render import render_edit
from app.project.manager import (
    create_project,
    load_project,
    mutate_project,
    validate_audio_source,
    validate_video_source,
)
from app.quality.validator import validate_render

FRAGMENT_SECONDS = 10.0
FPS = 30


class IntegrationTestCase(unittest.TestCase):
    """Base class that builds a throw-away project with generated media."""

    project: dict[str, Any]

    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="lumen_integration_"))
        self.project = create_project("integration test")

        def configure(project: dict[str, Any]) -> None:
            project["fragment"] = {
                "start": 0.0,
                "end": FRAGMENT_SECONDS,
                "duration": FRAGMENT_SECONDS,
            }
            project["config"] = {
                "count": 1,
                "duration": FRAGMENT_SECONDS,
                "format": "9:16",
                "resolution": "720p",
                "fps": FPS,
                "quality": "fast",
                "encoder": "cpu",
                "seed": 20261107,
                "styles": ["cinematic"],
            }

        mutate_project(self.project["id"], configure)
        self._create_test_media()
        self.project = load_project(self.project["id"])

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        shutil.rmtree(project_layout(self.project["id"])["root"], ignore_errors=True)

    def _create_test_media(self) -> None:
        """Generate a 10 s sine wave and a 10 s test-pattern clip."""
        layout = project_layout(self.project["id"])
        audio_path = layout["source"] / "test_audio.wav"
        video_path = layout["source"] / "test_video.mp4"

        subprocess.run(
            [
                "ffmpeg", "-y", "-f", "lavfi", "-i",
                "sine=frequency=440:duration=10:sample_rate=48000",
                "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le",
                str(audio_path),
            ],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "ffmpeg", "-y", "-f", "lavfi", "-i",
                "testsrc=duration=10:size=1280x720:rate=30",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                "-pix_fmt", "yuv420p", "-r", "30",
                str(video_path),
            ],
            check=True,
            capture_output=True,
        )

        def add_media(project: dict[str, Any]) -> None:
            project["audio"] = {
                "filename": "test_audio.wav",
                "path": "source/test_audio.wav",
                "duration": FRAGMENT_SECONDS,
                "size": audio_path.stat().st_size,
                "format": "wav",
                "sample_rate": 48000,
                "channels": 2,
                "codec": "pcm_s16le",
            }
            project["video"] = {
                "filename": "test_video.mp4",
                "path": "source/test_video.mp4",
                "duration": FRAGMENT_SECONDS,
                "width": 1280,
                "height": 720,
                "fps": FPS,
                "source_width": 1280,
                "source_height": 720,
                "source_fps": FPS,
                "codec": "h264",
                "format": "mp4",
                "source_kind": "upload",
                "attribution": None,
                "master": "master/master_1280x720_30.mp4",
                "scenes": 1,
                "thumb": "thumbs/master.jpg",
            }

        mutate_project(self.project["id"], add_media)

    def _master(self) -> dict[str, Any]:
        return asyncio.run(
            ensure_master(
                self.project["id"],
                validate_video_source(self.project),
                "9:16",
                "720p",
                FPS,
            )
        )

    def _scene_library(self, master: dict[str, Any]) -> dict[str, Any]:
        return analyze_and_cache(
            self.project["id"],
            {
                "abs_path": master["abs_path"],
                "fps": FPS,
                "key": master["key"],
                "width": master["width"],
                "height": master["height"],
            },
        )

    def _run_full_pipeline(self) -> dict[str, Any]:
        """Run audio -> video -> planning and return the generated EDL."""
        layout = project_layout(self.project["id"])
        audio_source = validate_audio_source(self.project)
        fragment = asyncio.run(extract_fragment(self.project["id"], audio_source, 0, FRAGMENT_SECONDS))

        analysis = analyze_audio_file(str(layout["root"] / fragment["mono"]), FRAGMENT_SECONDS)
        analysis["cache_key"] = "test"

        master = self._master()
        scene_library = self._scene_library(master)

        config = {
            "count": 1,
            "duration": FRAGMENT_SECONDS,
            "format": "9:16",
            "resolution": "720p",
            "fps": FPS,
            "quality": "fast",
            "encoder": "cpu",
            "seed": 20261107,
            "styles": ["cinematic"],
            "weights": {},
            "effects": {},
        }
        versions = generate_versions(
            project_id=self.project["id"],
            audio=analysis,
            scene_library=scene_library,
            master_rel=master["path"],
            audio_rel=fragment["stereo"],
            master_duration=float(scene_library.get("duration") or FRAGMENT_SECONDS),
            config=config,
            lyrics={},
        )
        return versions[0]


class AudioAnalysisIntegrationTest(IntegrationTestCase):
    """Audio analysis pipeline."""

    def test_audio_analysis_produces_valid_beats_and_sections(self) -> None:
        layout = project_layout(self.project["id"])
        audio_source = validate_audio_source(self.project)
        fragment_path = layout["analysis"] / "audio" / "fragment_mono.wav"
        fragment_path.parent.mkdir(parents=True, exist_ok=True)

        subprocess.run(
            [
                "ffmpeg", "-y", "-ss", "0", "-t", "10",
                "-i", str(audio_source), "-vn", "-ac", "1", "-ar", "22050",
                "-c:a", "pcm_s16le", str(fragment_path),
            ],
            check=True,
            capture_output=True,
        )

        analysis = analyze_audio_file(str(fragment_path), FRAGMENT_SECONDS)

        self.assertGreater(analysis["duration"], 9.0)
        self.assertLess(analysis["duration"], 11.0)

        self.assertIn("bpm", analysis["tempo"])
        self.assertGreaterEqual(analysis["tempo"]["confidence"], 0.0)
        self.assertLessEqual(analysis["tempo"]["confidence"], 1.0)

        self.assertIsInstance(analysis["beats"], list)
        self.assertGreater(len(analysis["beats"]), 0)
        for beat in analysis["beats"]:
            self.assertIn("t", beat)
            self.assertIn("index", beat)
            self.assertIn("is_downbeat", beat)
            self.assertIn("bands", beat)
            self.assertGreaterEqual(beat["strength"], 0.0)
            self.assertLessEqual(beat["strength"], 1.0)

        self.assertIsInstance(analysis["sections"], list)
        self.assertIsInstance(analysis["events"], list)
        self.assertIn("beats", analysis["analysis_engine"])
        self.assertIn("sections", analysis["analysis_engine"])


class VideoAnalysisIntegrationTest(IntegrationTestCase):
    """Video analysis pipeline."""

    def test_video_analysis_produces_scenes(self) -> None:
        master = self._master()
        scene_library = self._scene_library(master)

        self.assertGreater(scene_library["duration"], 0)
        self.assertIsInstance(scene_library["scenes"], list)
        self.assertGreater(len(scene_library["scenes"]), 0)

        scene = scene_library["scenes"][0]
        for key in ("id", "start", "end", "duration", "quality", "motion"):
            self.assertIn(key, scene)

        for key in ("master_path", "width", "height", "fps", "thumb"):
            self.assertIn(key, scene_library)


class PlanningIntegrationTest(IntegrationTestCase):
    """EDL planning pipeline."""

    def test_generate_versions_creates_valid_edls(self) -> None:
        edl = self._run_full_pipeline()

        self.assertIn("id", edl)
        self.assertIn("project_id", edl)
        self.assertAlmostEqual(edl["duration"], FRAGMENT_SECONDS, delta=0.1)
        self.assertIsInstance(edl["segments"], list)
        self.assertGreater(len(edl["segments"]), 0)

        master = self._master()
        scene_library = self._scene_library(master)
        issues = validate_edl(edl, float(scene_library.get("duration") or FRAGMENT_SECONDS))
        self.assertEqual(issues, [], f"EDL validation failed: {issues}")

        for segment in edl["segments"]:
            for key in (
                "id",
                "index",
                "timeline_start",
                "timeline_end",
                "duration",
                "source_start",
                "source_end",
                "source_duration",
                "scene_id",
                "scene_start",
                "scene_end",
                "cut_type",
                "transition",
            ):
                self.assertIn(key, segment)
            self.assertGreaterEqual(segment["duration"], 0.1)
            self.assertGreaterEqual(segment["source_duration"], segment["duration"])
            self.assertGreaterEqual(segment["source_end"], segment["source_start"])

    def test_validate_edl_rejects_duration_mismatch(self) -> None:
        edl = self._run_full_pipeline()
        edl["duration"] = float(edl["duration"]) + 5.0

        issues = validate_edl(edl)
        self.assertTrue(any("no coincide" in issue for issue in issues), issues)


class RenderIntegrationTest(IntegrationTestCase):
    """Render pipeline: the same saved EDL used by preview and final output."""

    def test_render_edit_produces_valid_mp4(self) -> None:
        edl = self._run_full_pipeline()
        layout = project_layout(self.project["id"])

        render = asyncio.run(
            render_edit(
                load_project(self.project["id"]),
                edl,
                preview=True,
                quality="fast",
                encoder="cpu",
            )
        )

        self.assertIn("id", render)
        self.assertIn("path", render)
        self.assertTrue(render["validation"]["ok"], render["validation"]["issues"])

        output_path = layout["root"] / render["path"]
        self.assertTrue(output_path.exists(), f"Output file not found: {output_path}")

        info = probe(output_path)
        self.assertTrue(info.has_video)
        self.assertTrue(info.has_audio)
        self.assertAlmostEqual(info.duration, float(edl["duration"]), delta=0.5)


class ValidationIntegrationTest(unittest.TestCase):
    """Validation pipeline against real files."""

    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="lumen_validation_"))

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_validate_render_catches_corrupt_file(self) -> None:
        corrupt_path = self.temp_dir / "corrupt.mp4"
        corrupt_path.write_bytes(b"not a valid mp4")

        validation = validate_render(
            str(corrupt_path), expected_duration=5.0, width=640, height=360, fps=FPS
        )
        self.assertFalse(validation["ok"])
        messages = " ".join(issue["message"].lower() for issue in validation["issues"])
        self.assertIn("no se pudo leer", messages)

    def test_validate_render_catches_missing_file(self) -> None:
        missing_path = self.temp_dir / "missing.mp4"
        validation = validate_render(
            str(missing_path), expected_duration=5.0, width=640, height=360, fps=FPS
        )
        self.assertFalse(validation["ok"])
        self.assertTrue(any("no existe" in issue["message"] for issue in validation["issues"]))

    def test_validate_render_passes_for_valid_mp4(self) -> None:
        temp_file = self.temp_dir / "valid.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-f", "lavfi", "-i",
                "testsrc=duration=5:size=640x360:rate=30",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=5:sample_rate=48000",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                "-pix_fmt", "yuv420p", "-r", "30",
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                "-f", "mp4", str(temp_file),
            ],
            check=True,
            capture_output=True,
        )

        validation = validate_render(
            str(temp_file), expected_duration=5.0, width=640, height=360, fps=FPS
        )
        self.assertTrue(validation["ok"], validation["issues"])


if __name__ == "__main__":
    unittest.main()
