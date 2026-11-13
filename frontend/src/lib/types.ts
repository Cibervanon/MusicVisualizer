export type Step = "setup" | "customize" | "generating" | "results" | "editor";

export type Format = "9:16" | "1:1" | "16:9" | "4:5";
export type Resolution = "720p" | "1080p" | "1440p";
export type Quality = "fast" | "balanced" | "high";
export type Encoder = "cpu" | "qsv";

export interface ProjectAudio {
  filename: string;
  path: string;
  size: number;
  duration: number;
  format: string;
  sample_rate: number;
  channels: number;
  codec: string;
}

export interface ProjectVideo {
  filename: string;
  path: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  source_width?: number;
  source_height?: number;
  source_fps?: number;
  codec: string;
  format: string;
  source_kind: "upload" | "youtube";
  attribution: { title?: string; uploader?: string; url?: string; note?: string } | null;
  master?: string;
  scenes?: number;
  thumb?: string;
}

export interface AnalysisSummary {
  audio: {
    duration: number;
    bpm: number;
    confidence: number;
    beats: number;
    sections: Section[];
    events: number;
    engine: Record<string, unknown>;
  } | null;
  video: {
    scenes: number;
    duration: number;
    width: number;
    height: number;
    fps: number;
    thumb: string | null;
    engine: Record<string, unknown>;
  } | null;
}

export interface Section {
  start: number;
  end: number;
  label: string;
  intensity: number;
  confidence: number;
}

export interface EditSummary {
  id: string;
  style: string;
  style_name: string;
  accent: string;
  duration: number;
  format: string;
  fps: number;
  width: number;
  height: number;
  stats: {
    segments: number;
    cuts_per_second: number;
    avg_shot: number;
    unique_scenes: number;
    density_target: [number, number];
  };
  segments: number;
  created_at: number;
  edited_at?: number | null;
  render: RenderInfo | null;
}

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  message: string;
}

export interface RenderInfo {
  id: string;
  edit_id: string;
  project_id: string;
  type: "preview" | "final";
  filename: string;
  path: string;
  thumb: string | null;
  status: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  size: number;
  quality: Quality;
  encoder: string;
  note: string | null;
  validation: {
    ok: boolean;
    issues: ValidationIssue[];
    info: Record<string, unknown> | null;
  };
  elapsed: number;
  created_at: number;
  style: string;
  style_name: string;
}

export interface LyricsLine {
  id?: string;
  start: number;
  end: number;
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

export interface LyricsStyle {
  id?: string;
  name?: string;
  font: string;
  size: number;
  bold: boolean;
  color: string;
  active_color: string;
  outline: number;
  outline_color: string;
  shadow: number;
  shadow_color: string;
  glow: number;
  opacity: number;
  spacing: number;
  align: string;
  pos_x: number;
  pos_y: number;
  animation_in: string;
  animation_out: string;
  animation_speed: number;
  background: boolean;
  background_color: string;
  background_opacity: number;
  uppercase: boolean;
}

export interface LyricsPayload {
  enabled: boolean;
  source: string;
  style: LyricsStyle;
  lines: LyricsLine[];
  updated_at: number | null;
  note: string;
}

export interface Project {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  audio: ProjectAudio | null;
  fragment: { start: number; end: number; duration: number } | null;
  video: ProjectVideo | null;
  youtube: Record<string, unknown> | null;
  config: StudioConfig;
  analysis: {
    audio: string | null;
    video: string | null;
    audio_key: string | null;
    video_key: string | null;
  };
  edits: EditSummary[];
  renders: RenderInfo[];
  lyrics: LyricsPayload;
  analysis_summary: AnalysisSummary;
  analysis_ready: { audio: boolean; video: boolean };
}

export interface ProjectListItem {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  has_audio: boolean;
  has_video: boolean;
  renders: number;
}

export interface StudioConfig {
  count: number;
  duration: number;
  format: Format;
  resolution: Resolution;
  fps: 24 | 25 | 30 | 60;
  quality: Quality;
  encoder: Encoder;
  seed: number;
  styles: string[];
  weights?: Record<string, number>;
  effects?: Record<string, number>;
}

export interface JobClip {
  index: number;
  edit_id: string | null;
  style: string | null;
  style_name: string | null;
  accent?: string | null;
  status: "queued" | "rendering" | "ready" | "error" | "cancelled";
  progress: number;
  render_id: string | null;
  error: string | null;
  error_detail?: Record<string, unknown> | null;
}

export interface Job {
  id: string;
  kind: string;
  project_id: string;
  status: "queued" | "running" | "cancelling" | "done" | "error" | "cancelled";
  stage: string;
  progress: number;
  message: string;
  clips: JobClip[];
  result: {
    audio?: Record<string, unknown>;
    video?: Record<string, unknown>;
    master?: string;
    edits?: EditSummary[];
    renders?: RenderInfo[];
    render?: RenderInfo;
    project?: { id: string; edits: EditSummary[]; renders: RenderInfo[] };
  } | null;
  error: string | null;
  warnings: string[];
  logs: Array<{ t: number; message: string }>;
  cancel_requested: boolean;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface StylePreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  beat_min: number;
  beat_max: number;
  min_shot: number;
  max_shot: number;
  transition: string;
  transition_duration: number;
  motion_target: number;
  density_min: number;
  density_max: number;
  grade: Record<string, number>;
  effects: Record<string, number>;
  weights: Record<string, number>;
  allowed_effects: string[];
}

export interface TextPreset extends LyricsStyle {
  id: string;
  name: string;
}

export interface Capabilities {
  app: { name: string; version: string };
  python: string;
  platform: string;
  ffmpeg: string;
  encoders: Record<string, boolean>;
  filters: Record<string, boolean>;
  opencv: { version: string | null; saliency: boolean };
  extras: Record<string, boolean>;
  cpu_count: number;
  max_parallel_renders: number;
  disk: { total_gb: number; free_gb: number; used_percent: number };
  youtube_available: boolean;
  root: string;
}

export interface Segment {
  id: string;
  index: number;
  timeline_start: number;
  timeline_end: number;
  duration: number;
  source_start: number;
  source_end: number;
  source_duration: number;
  scene_id: string;
  scene_start: number;
  scene_end: number;
  cut_type: string;
  transition: string;
  score?: Record<string, number>;
}

export interface EDL {
  schema_version: number;
  id: string;
  project_id: string;
  version_index: number;
  style: string;
  style_name: string;
  seed: number;
  duration: number;
  format: Format;
  width: number;
  height: number;
  fps: number;
  master: string;
  audio: string;
  volume: number;
  segments: Segment[];
  transition: { type: string; duration: number };
  grade: Record<string, number>;
  effects: Record<string, number>;
  weights: Record<string, number>;
  stats: Record<string, unknown>;
  lyrics: { enabled: boolean; style: Record<string, unknown> };
  allowed_effects: string[];
  created_at: number;
  edited_at?: number | null;
}
