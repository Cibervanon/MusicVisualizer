"""Integration tests for the full render pipeline.

Tests the complete pipeline: audio analysis → video analysis → planning → render → validation.
Run from `backend/`:
    .venv\Scripts\python.exe -m pytest tests/test_integration.py -v
"""

from __future__ import annotations

import asyncio
import shutil
import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.analysis.audio_analyzer import ANALYSIS_VERSION, analyze_audio_file, extract_fragment
from app.analysis.video_analyzer import analyze_and_cache
from app.core.config import settings
from app.core.ffmpeg import probe
from app.core.paths import project_layout
from app.core.util import read_json, write_json
from app.editing.generator import edit_summary, generate_versions
from app.editing.planner import plan_edit, validate_edl
from app.media.master import ensure_master
from app.media.render import render_edit
from app.project.manager import (
    add_render,
    create_project,
    load_project,
    mutate_project,
    validate_audio_source,
    validate_video_source,
)
from app.quality.validator import validate_render


class IntegrationTestCase(unittest.TestCase):
    """Base class for integration tests with temporary project."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="lumen_integration_")
        self.project = create_project("integration test")

        # Configure project with minimal settings
        def configure(project: dict) -> None:
            project["fragment"] = {"start": 0.0, "end": 10.0, "duration": 10.0}
            project["config"] = {
                "count": 1,
                "duration": 10.0,
                "format": "9:16",
                "resolution": "720p",
                "fps": 30,
                "quality": "fast",
                "encoder": "cpu",
                "seed": 20261107,
                "styles": ["cinematic"],
            }

        from app.project.manager import mutate_project
        mutate_project(self.project["id"], configure)

        # Reload project to get updated data
        from app.project.manager import load_project
        self.project = load_project(self.project["id"])

        # Create minimal test audio and video files
        self._create_test_media()

        # Reload project after media creation
        self.project = load_project(self.project["id"])

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        # Clean up project
        try:
            project_layout(self.project["id"])["root"].rmdir()
        except Exception:
            pass

    def _create_test_media(self) -> None:
        """Create minimal test audio (sine wave) and video (color bars)."""
        import subprocess

        layout = project_layout(self.project["id"])
        audio_path = layout["source"] / "test_audio.wav"
        video_path = layout["source"] / "test_video.mp4"

        # Create 10s sine wave audio
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            "sine=frequency=440:duration=10:sample_rate=48000",
            "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le",
            str(audio_path)
        ], check=True, capture_output=True)

        # Create 10s color bars video
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            "testsrc=duration=10:size=1280x720:rate=30",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
            "-pix_fmt", "yuv420p", "-r", "30",
            str(video_path)
        ], check=True, capture_output=True)

        # Update project with media paths
        def add_media(project: dict) -> None:
            project["audio"] = {
                "filename": "test_audio.wav",
                "path": "source/test_audio.wav",
                "duration": 10.0,
                "size": 1000,
                "format": "wav",
                "sample_rate": 48000,
                "channels": 2,
                "codec": "pcm_s16le",
            }
            project["video"] = {
                "filename": "test_video.mp4",
                "path": "source/test_video.mp4",
                "duration": 10.0,
                "width": 1280,
                "height": 720,
                "fps": 30,
                "source_width": 1280,
                "source_height": 720,
                "source_fps": 30,
                "codec": "h264",
                "format": "mp4",
                "source_kind": "upload",
                "attribution": None,
                "master": "master/master_1280x720_30.mp4",
                "scenes": 1,
                "thumb": "thumbs/master.jpg",
            }

        from app.project.manager import mutate_project
        mutate_project(self.project["id"], add_media)

    def _run_full_pipeline(self) -> dict:
        """Run the full pipeline and return the EDL."""
        project = self.project
        layout = project_layout(project["id"])

        # Run audio analysis
        audio_source = validate_audio_source(project)
        fragment = asyncio.get_event_loop().run_until_complete(
            extract_fragment(project["id"], audio_source, 0, 10)
        )

        audio_path = layout["root"] / fragment["mono"]
        analysis = asyncio.get_event_loop().run_in_executor(
            None, analyze_audio_file, str(audio_path), 10.0
        )
        analysis = asyncio.get_event_loop().run_until_complete(analysis)
        analysis["cache_key"] = "test"

        # Run video analysis
        video_source = validate_video_source(project)
        master = asyncio.get_event_loop().run_until_complete(
            ensure_master(project["id"], video_source, "9:16", "720p", 30)
        )
        master_meta = {
            "abs_path": master["abs_path"],
            "fps": 30,
            "key": master["key"],
            "width": 404,
            "height": 720,
        }
        scene_library = analyze_and_cache(project["id"], master_meta)

        # Generate versions
        config = {
            "count": 1,
            "duration": 10.0,
            "format": "9:16",
            "resolution": "720p",
            "fps": 30,
            "quality": "fast",
            "encoder": "cpu",
            "seed": 20261107,
            "styles": ["cinematic"],
            "weights": {},
            "effects": {},
        }

        versions = generate_versions(
            project_id=project["id"],
            audio=analysis,
            scene_library=scene_library,
            master_rel=master["path"],
            audio_rel=fragment["stereo"],
            master_duration=float(scene_library.get("duration") or 10.0),
            config=config,
            lyrics={},
        )

        return versions[0]


class AudioAnalysisIntegrationTest(IntegrationTestCase):
    """Test audio analysis pipeline."""

    def test_audio_analysis_produces_valid_beats_and_sections(self) -> None:
        """Test that audio analysis produces valid beats, sections, and events."""
        project = self.project
        layout = project_layout(project["id"])
        audio_source = validate_audio_source(project)

        # Extract fragment
        fragment_path = layout["analysis"] / "audio" / "fragment_mono.wav"
        fragment_path.parent.mkdir(parents=True, exist_ok=True)

        import subprocess
        subprocess.run([
            "ffmpeg", "-y", "-ss", "0", "-t", "10",
            "-i", str(audio_source), "-vn", "-ac", "1", "-ar", "22050",
            "-c:a", "pcm_s16le", str(fragment_path)
        ], check=True, capture_output=True)

        # Analyze
        analysis = analyze_audio_file(str(fragment_path), 10.0)

        # Verify analysis structure
        self.assertIn("duration", analysis)
        self.assertGreater(analysis["duration"], 9.0)
        self.assertLess(analysis["duration"], 11.0)

        self.assertIn("tempo", analysis)
        self.assertIn("bpm", analysis["tempo"])
        self.assertIn("confidence", analysis["tempo"])
        self.assertGreaterEqual(analysis["tempo"]["confidence"], 0.0)
        self.assertLessEqual(analysis["tempo"]["confidence"], 1.0)

        self.assertIn("beats", analysis)
        self.assertIsInstance(analysis["beats"], list)
        self.assertGreater(len(analysis["beats"]), 0)

        # Verify beat structure
        for beat in analysis["beats"]:
            self.assertIn("t", beat)
            self.assertIn("index", beat)
            self.assertIn("is_downbeat", beat)
            self.assertIn("strength", beat)
            self.assertIn("bands", beat)
            self.assertGreaterEqual(beat["strength"], 0.0)
            self.assertLessEqual(beat["strength"], 1.0)

        self.assertIn("sections", analysis)
        self.assertIsInstance(analysis["sections"], list)

        self.assertIn("events", analysis)
        self.assertIsInstance(analysis["events"], list)

        self.assertIn("analysis_engine", analysis)
        self.assertIn("beats", analysis["analysis_engine"])
        self.assertIn("sections", analysis["analysis_engine"])


class VideoAnalysisIntegrationTest(IntegrationTestCase):
    """Test video analysis pipeline."""

    def test_video_analysis_produces_scenes(self) -> None:
        """Test that video analysis produces scene library."""
        project = self.project
        validate_video_source(project)

        # Create master first
        master = asyncio.get_event_loop().run_until_complete(
            ensure_master(project["id"], validate_video_source(project), "9:16", "720p", 30)
        )

        # Analyze video
        scene_library = analyze_and_cache(project["id"], {
            "abs_path": master["abs_path"],
            "fps": 30,
            "key": master["key"],
            "width": 404,
            "height": 720,
        })

        # Verify scene library structure
        self.assertIn("duration", scene_library)
        self.assertGreater(scene_library["duration"], 0)

        self.assertIn("scenes", scene_library)
        self.assertIsInstance(scene_library["scenes"], list)

        if scene_library["scenes"]:
            scene = scene_library["scenes"][0]
            self.assertIn("id", scene)
            self.assertIn("start", scene)
            self.assertIn("end", scene)
            self.assertIn("duration", scene)
            self.assertIn("quality", scene)
            self.assertIn("motion", scene)
            # Scene uses sample_center instead of start_frame/end_frame
            self.assertTrue("start_frame" in scene or "sample_center" in scene)
            self.assertTrue("end_frame" in scene or "sample_center" in scene)

        self.assertIn("master_path", scene_library)
        self.assertIn("width", scene_library)
        self.assertIn("height", scene_library)
        self.assertIn("fps", scene_library)
        self.assertIn("thumb", scene_library)


class PlanningIntegrationTest(IntegrationTestCase):
    """Test EDL planning pipeline."""

    def test_generate_versions_creates_valid_edls(self) -> None:
        """Test that generate_versions creates valid EDLs."""
        edl = self._run_full_pipeline()

        # Verify versions
        self.assertIn("id", edl)
        self.assertIn("project_id", edl)
        self.assertIn("duration", edl)
        self.assertAlmostEqual(edl["duration"], 10.0, delta=0.1)

        self.assertIn("segments", edl)
        self.assertIsInstance(edl["segments"], list)
        self.assertGreater(len(edl["segments"]), 0)

        # Validate EDL
        layout = project_layout(self.project["id"])
        master = asyncio.get_event_loop().run_until_complete(
            ensure_master(self.project["id"], validate_video_source(self.project), "9:16", "720p", 30)
        )
        scene_library = analyze_and_cache(self.project["id"], {
            "abs_path": master["abs_path"],
            "fps": 30,
            "key": master["key"],
            "width": 404,
            "height": 720,
        })
        issues = validate_edl(edl, float(scene_library.get("duration") or 10.0))
        self.assertEqual(len(issues), 0, f"EDL validation failed: {issues}")

        # Verify segment structure
        for segment in edl["segments"]:
            self.assertIn("id", segment)
            self.assertIn("index", segment)
            self.assertIn("timeline_start", segment)
            self.assertIn("timeline_end", segment)
            self.assertIn("duration", segment)
            self.assertIn("source_start", segment)
            self.assertIn("source_end", segment)
            self.assertIn("source_duration", segment)
            self.assertIn("scene_id", segment)
            self.assertIn("scene_start", segment)
            self.assertIn("scene_end", segment)
            self.assertIn("cut_type", segment)
            self.assertIn("transition", segment)

            self.assertGreaterEqual(segment["duration"], 0.1)
            self.assertGreaterEqual(segment["source_duration"], segment["duration"])
            self.assertGreaterEqual(segment["source_end"], segment["source_start"])


class ValidationIntegrationTest(unittest.TestCase):
    """Test validation pipeline."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="lumen_validation_")

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_validate_render_catches_corrupt_file(self) -> None:
        """Test that validation catches corrupt/truncated files."""
        corrupt_path = Path(self.temp_dir) / "corrupt.mp4"
        corrupt_path.write_bytes(b"not a valid mp4")

        validation = validate_render(str(corrupt_path), expected_duration=5.0, width=640, height=360, fps=30)
        self.assertFalse(validation["ok"])
        self.assertTrue(any("no se pudo leer" in issue["message"].lower() or "no existe" in issue["message"].lower()
                           for issue in validation["issues"]))

    def test_validate_render_catches_missing_file(self) -> None:
        """Test that validation catches missing files."""
        missing_path = Path(self.temp_dir) / "missing.mp4"
        validation = validate_render(str(missing_path), expected_duration=5.0, width=640, height=360, fps=30)
        self.assertFalse(validation["ok"])
        self.assertTrue(any("no existe" in issue["message"] for issue in validation["issues"]))

    def test_validate_render_passes_for_valid_mp4(self) -> None:
        """Test that validation passes for a valid MP4 with audio."""
        import subprocess
        temp_file = Path(self.temp_dir) / "valid.mp4"
        # Create a minimal valid MP4 WITH AUDIO
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            "testsrc=duration=5:size=640x360:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=5:sample_rate=48000",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
            "-pix_fmt", "yuv420p", "-r", "30",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
            "-f", "mp4", str(temp_file)
        ], check=True, capture_output=True)

        validation = validate_render(str(temp_file), expected_duration=5.0, width=640, height=360, fps=30)
        self.assertTrue(validation["ok"], f"Validation failed: {validation['issues']}")


if __name__ == "__main__":
    unittest.main()