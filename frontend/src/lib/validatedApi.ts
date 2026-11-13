import { z } from "zod";

import { projectCreateSchema, projectConfigureSchema, analyzeAudioSchema, analyzeVideoSchema, generateSchema, renderSchema, editPatchSchema, lyricsUpdateSchema, lyricsImportSchema, transcribeSchema, zipSchema, youtubePreflightSchema, youtubeImportSchema } from "./validation";
import type { Project, ProjectListItem, Capabilities, StylePreset, TextPreset, Job, EDL, RenderInfo, LyricsPayload, StudioConfig } from "./types";
import { api as rawApi, ApiError, downloadUrl, mediaUrl, waitForJob, saveBlob } from "./api";

function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new ApiError(`Validación fallida: ${errors}`, "validation_error", 422, result.error.flatten());
  }
  return result.data;
}

export const api = {
  health: () => rawApi.health(),
  capabilities: () => rawApi.capabilities(),
  styles: () => rawApi.styles(),
  lyricPresets: () => rawApi.lyricPresets(),

  listProjects: () => rawApi.listProjects(),
  createProject: (name: string) => {
    const data = validateRequest(projectCreateSchema, { name });
    return rawApi.createProject(data.name ?? "");
  },
  getProject: (id: string) => rawApi.getProject(id),
  configure: (config: Partial<StudioConfig> & { project_id: string }) => {
    const data = validateRequest(projectConfigureSchema, config);
    // projectConfigureSchema ensures project_id is present
    return rawApi.configure(data as Partial<StudioConfig> & { project_id: string });
  },

  uploadAudio: (projectId: string, file: File, onProgress?: (value: number) => void) =>
    rawApi.uploadAudio(projectId, file, onProgress),
  uploadVideo: (projectId: string, file: File, onProgress?: (value: number) => void) =>
    rawApi.uploadVideo(projectId, file, onProgress),

  youtubePreflight: (url: string, rightsConfirmed: boolean) => {
    const data = validateRequest(youtubePreflightSchema, { url, rights_confirmed: rightsConfirmed });
    return rawApi.youtubePreflight(data.url, data.rights_confirmed);
  },
  youtubeImport: (projectId: string, url: string, rightsConfirmed: boolean) => {
    const data = validateRequest(youtubeImportSchema, { project_id: projectId, url, rights_confirmed: rightsConfirmed });
    return rawApi.youtubeImport(data.project_id, data.url, data.rights_confirmed);
  },

  analyzeAudio: (projectId: string, start: number, end: number, force = false) => {
    const data = validateRequest(analyzeAudioSchema, { project_id: projectId, start, end, force });
    return rawApi.analyzeAudio(data.project_id, data.start, data.end, data.force);
  },
  analyzeVideo: (projectId: string, format: string, resolution: string, fps: number, force = false) => {
    const data = validateRequest(analyzeVideoSchema, { project_id: projectId, format, resolution, fps, force });
    return rawApi.analyzeVideo(data.project_id, data.format, data.resolution, data.fps, data.force);
  },

  generate: (payload: {
    project_id: string;
    count: number;
    duration: number;
    format: string;
    resolution: string;
    fps: number;
    quality: string;
    encoder: string;
    seed: number;
    styles: string[];
    lyrics?: { enabled: boolean; style: Record<string, unknown>; lines?: unknown[] } | null;
  }) => {
    const data = validateRequest(generateSchema, payload);
    // Transform lyrics to match raw API expectation
    const generatePayload = {
      ...data,
      lyrics: data.lyrics && typeof data.lyrics === "object" && "enabled" in data.lyrics
        ? data.lyrics as { enabled: boolean; style: Record<string, unknown>; lines?: unknown[] }
        : undefined,
    };
    return rawApi.generate(generatePayload);
  },

  getJob: (id: string) => rawApi.getJob(id),
  listJobs: (projectId: string) => rawApi.listJobs(projectId),
  cancelJob: (id: string) => rawApi.cancelJob(id),

  getLyrics: (projectId: string) => rawApi.getLyrics(projectId),
  updateLyrics: (payload: {
    project_id: string;
    lines: unknown[];
    source?: string;
    style?: Record<string, unknown>;
    enabled?: boolean;
  }) => {
    const data = validateRequest(lyricsUpdateSchema, payload);
    return rawApi.updateLyrics(data);
  },
  importLyrics: (projectId: string, content: string, kind: "srt" | "lrc" | "text") => {
    const data = validateRequest(lyricsImportSchema, { project_id: projectId, content, kind });
    return rawApi.importLyrics(data.project_id, data.content, data.kind);
  },
  transcribe: (projectId: string, language: string | null, model: string) => {
    const data = validateRequest(transcribeSchema, { project_id: projectId, language, model });
    return rawApi.transcribe(data.project_id, data.language ?? null, data.model);
  },

  getEdit: (projectId: string, editId: string) => rawApi.getEdit(projectId, editId),
  patchEdit: (projectId: string, editId: string, payload: {
    segments?: unknown[];
    effects?: Record<string, unknown>;
    grade?: Record<string, number>;
    lyrics_style?: Record<string, unknown>;
    volume?: number;
    weights?: Record<string, number>;
  }) => {
    const data = validateRequest(editPatchSchema, payload);
    return rawApi.patchEdit(projectId, editId, data);
  },

  render: (payload: {
    project_id: string;
    edit_id: string;
    preview?: boolean;
    quality?: string;
    encoder?: string;
  }) => {
    const data = validateRequest(renderSchema, payload);
    return rawApi.render(data);
  },

  getRender: (renderId: string, projectId: string) => rawApi.getRender(renderId, projectId),
  deleteRender: (renderId: string, projectId: string) => rawApi.deleteRender(renderId, projectId),

  downloadZip: async (projectId: string, renderIds: string[] = []) => {
    const data = validateRequest(zipSchema, { project_id: projectId, render_ids: renderIds });
    return rawApi.downloadZip(data.project_id, data.render_ids);
  },
};

export { downloadUrl, mediaUrl, saveBlob, waitForJob, ApiError };
export type { Project, ProjectListItem, Capabilities, StylePreset, TextPreset, Job, EDL, RenderInfo, LyricsPayload, StudioConfig };