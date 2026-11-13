import { z } from "zod";

export const formatSchema = z.enum(["9:16", "1:1", "16:9", "4:5"]);
export const resolutionSchema = z.enum(["720p", "1080p", "1440p"]);
export const qualitySchema = z.enum(["fast", "balanced", "high"]);
export const encoderSchema = z.enum(["cpu", "qsv"]);
export const fpsSchema = z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]);

export const projectCreateSchema = z.object({
  name: z.string().max(80).optional(),
});

export const projectConfigureSchema = z.object({
  project_id: z.string().optional(),
  count: z.number().int().min(1).max(20).optional(),
  duration: z.number().min(3).max(300).optional(),
  format: formatSchema.optional(),
  resolution: resolutionSchema.optional(),
  fps: fpsSchema.optional(),
  quality: qualitySchema.optional(),
  encoder: encoderSchema.optional(),
  seed: z.number().int().optional(),
  styles: z.array(z.string()).optional(),
  weights: z.record(z.string(), z.number()).optional(),
  effects: z.record(z.string(), z.number()).optional(),
});

export const fragmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
}).refine((data) => data.end > data.start, {
  message: "El final debe ser mayor que el inicio",
  path: ["end"],
});

export const analyzeAudioSchema = z.object({
  project_id: z.string().min(1),
  start: z.number().min(0),
  end: z.number().min(0),
  force: z.boolean().default(false),
});

export const analyzeVideoSchema = z.object({
  project_id: z.string().min(1),
  format: formatSchema.default("9:16"),
  resolution: resolutionSchema.default("1080p"),
  fps: fpsSchema.default(30),
  force: z.boolean().default(false),
});

export const lyricsLineSchema = z.object({
  id: z.string().optional(),
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().default(""),
  words: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const lyricsUpdateSchema = z.object({
  project_id: z.string().min(1),
  lines: z.array(lyricsLineSchema),
  source: z.string().default("manual"),
  style: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

export const lyricsImportSchema = z.object({
  project_id: z.string().min(1),
  content: z.string(),
  kind: z.enum(["srt", "lrc", "text"]),
});

export const transcribeSchema = z.object({
  project_id: z.string().min(1),
  language: z.string().optional(),
  model: z.string().default("small"),
});

export const generateSchema = z.object({
  project_id: z.string().min(1),
  count: z.number().int().min(1).max(20).default(5),
  duration: z.number().min(3).max(300).default(30),
  format: formatSchema.default("9:16"),
  resolution: resolutionSchema.default("1080p"),
  fps: fpsSchema.default(30),
  quality: qualitySchema.default("balanced"),
  encoder: encoderSchema.default("cpu"),
  seed: z.number().int().default(20261107),
  styles: z.array(z.string()).default([]),
  weights: z.record(z.string(), z.number()).default({}),
  effects: z.record(z.string(), z.number()).default({}),
  lyrics: z.record(z.string(), z.unknown()).optional(),
});

export const renderSchema = z.object({
  project_id: z.string().min(1),
  edit_id: z.string().min(1),
  preview: z.boolean().default(false),
  quality: qualitySchema.optional(),
  encoder: encoderSchema.optional(),
});

export const editPatchSchema = z.object({
  segments: z.array(z.record(z.string(), z.unknown())).optional(),
  effects: z.record(z.string(), z.unknown()).optional(),
  grade: z.record(z.string(), z.number()).optional(),
  lyrics_style: z.record(z.string(), z.unknown()).optional(),
  volume: z.number().min(0).max(2).optional(),
  weights: z.record(z.string(), z.number()).optional(),
});

export const zipSchema = z.object({
  project_id: z.string().min(1),
  render_ids: z.array(z.string()).default([]),
});

export const youtubePreflightSchema = z.object({
  url: z.string().url().min(8).max(2000),
  rights_confirmed: z.boolean().default(false),
});

export const youtubeImportSchema = z.object({
  project_id: z.string().min(1),
  url: z.string().url().min(8).max(2000),
  rights_confirmed: z.boolean(),
});

// Type exports for inference
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
export type ProjectConfigure = z.infer<typeof projectConfigureSchema>;
export type Fragment = z.infer<typeof fragmentSchema>;
export type AnalyzeAudio = z.infer<typeof analyzeAudioSchema>;
export type AnalyzeVideo = z.infer<typeof analyzeVideoSchema>;
export type Generate = z.infer<typeof generateSchema>;
export type Render = z.infer<typeof renderSchema>;
export type EditPatch = z.infer<typeof editPatchSchema>;
export type LyricsUpdate = z.infer<typeof lyricsUpdateSchema>;
export type LyricsImport = z.infer<typeof lyricsImportSchema>;
export type Transcribe = z.infer<typeof transcribeSchema>;
export type Zip = z.infer<typeof zipSchema>;
export type YouTubePreflight = z.infer<typeof youtubePreflightSchema>;
export type YouTubeImport = z.infer<typeof youtubeImportSchema>;