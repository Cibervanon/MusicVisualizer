import type {
  Capabilities,
  EDL,
  Job,
  LyricsPayload,
  Project,
  ProjectListItem,
  RenderInfo,
  StylePreset,
  StudioConfig,
  TextPreset,
} from "./types";

export class ApiError extends Error {
  code: string;
  detail: unknown;
  status: number;

  constructor(message: string, code = "api_error", status = 0, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

type Json = Record<string, unknown>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new ApiError(
      "No se pudo conectar con el servidor local. Comprueba que el backend esté en marcha.",
      "network_error",
      0,
      error,
    );
  }
  if (!response.ok) {
    let payload: Json | null = null;
    try {
      payload = (await response.json()) as Json;
    } catch {
      payload = null;
    }
    const err = (payload?.error as Json | undefined) || undefined;
    throw new ApiError(
      String(err?.message || `Error ${response.status}`),
      String(err?.code || "api_error"),
      response.status,
      err?.detail ?? null,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function upload<T>(path: string, form: FormData, onProgress?: (value: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      let payload: Json | null = null;
      try {
        payload = JSON.parse(xhr.responseText) as Json;
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload) {
        resolve(payload as T);
        return;
      }
      const err = (payload?.error as Json | undefined) || undefined;
      reject(
        new ApiError(
          String(err?.message || `La subida falló (${xhr.status})`),
          String(err?.code || "upload_error"),
          xhr.status,
          err?.detail ?? null,
        ),
      );
    };
    xhr.onerror = () => reject(new ApiError("La subida se interrumpió.", "network_error"));
    xhr.send(form);
  });
}

export const api = {
  health: () => request<{ ok: boolean; ffmpeg: string }>("/api/health"),
  capabilities: () => request<Capabilities>("/api/system/capabilities"),
  styles: () => request<{ styles: StylePreset[] }>("/api/styles"),
  lyricPresets: () =>
    request<{ presets: TextPreset[]; animations: string[]; fonts: string[] }>(
      "/api/lyrics/presets",
    ),

  listProjects: () => request<{ projects: ProjectListItem[] }>("/api/projects"),
  createProject: (name: string) =>
    request<{ project: Project }>("/api/project/create", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getProject: (id: string) => request<{ project: Project }>(`/api/project/${id}`),
  configure: (config: Partial<StudioConfig> & { project_id: string }) =>
    request<{ project: Project }>("/api/project/configure", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  uploadAudio: (projectId: string, file: File, onProgress?: (value: number) => void) => {
    const form = new FormData();
    form.append("project_id", projectId);
    form.append("file", file);
    return upload<{ project: Project }>("/api/upload/audio", form, onProgress);
  },
  uploadVideo: (projectId: string, file: File, onProgress?: (value: number) => void) => {
    const form = new FormData();
    form.append("project_id", projectId);
    form.append("file", file);
    return upload<{ project: Project }>("/api/upload/video", form, onProgress);
  },
  youtubePreflight: (url: string, rightsConfirmed: boolean) =>
    request<{ metadata: Record<string, unknown> }>("/api/source/youtube/preflight", {
      method: "POST",
      body: JSON.stringify({ url, rights_confirmed: rightsConfirmed }),
    }),
  youtubeImport: (projectId: string, url: string, rightsConfirmed: boolean) =>
    request<{ project: Project; metadata: Record<string, unknown> }>(
      "/api/source/youtube/import",
      {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, url, rights_confirmed: rightsConfirmed }),
      },
    ),

  analyzeAudio: (projectId: string, start: number, end: number, force = false) =>
    request<{ job: Job }>("/api/audio/analyze", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, start, end, force }),
    }),
  analyzeVideo: (
    projectId: string,
    format: string,
    resolution: string,
    fps: number,
    force = false,
  ) =>
    request<{ job: Job }>("/api/video/analyze", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, format, resolution, fps, force }),
    }),

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
  }) =>
    request<{ job: Job }>("/api/clips/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getJob: (id: string) => request<{ job: Job }>(`/api/jobs/${id}`),
  listJobs: (projectId: string) =>
    request<{ jobs: Job[] }>(`/api/jobs?project_id=${encodeURIComponent(projectId)}`),
  cancelJob: (id: string) =>
    request<{ ok: boolean; job: Job }>(`/api/jobs/${id}/cancel`, { method: "POST" }),

  getLyrics: (projectId: string) =>
    request<{ lyrics: LyricsPayload }>(`/api/lyrics/${projectId}`),
  updateLyrics: (payload: {
    project_id: string;
    lines: unknown[];
    source?: string;
    style?: Record<string, unknown>;
    enabled?: boolean;
  }) =>
    request<{ lyrics: LyricsPayload }>("/api/lyrics/update", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  importLyrics: (projectId: string, content: string, kind: "srt" | "lrc" | "text") =>
    request<{ lyrics: LyricsPayload; count: number }>("/api/lyrics/import", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, content, kind }),
    }),
  transcribe: (projectId: string, language: string | null, model: string) =>
    request<{ job: Job }>("/api/lyrics/transcribe", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, language, model }),
    }),

  getEdit: (projectId: string, editId: string) =>
    request<{ edit: EDL }>(`/api/project/${projectId}/edits/${editId}`),
  patchEdit: (
    projectId: string,
    editId: string,
    payload: {
      segments?: unknown[];
      effects?: Record<string, unknown>;
      grade?: Record<string, number>;
      lyrics_style?: Record<string, unknown>;
      volume?: number;
      weights?: Record<string, number>;
    },
  ) =>
    request<{ edit: EDL }>(`/api/project/${projectId}/edits/${editId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  render: (payload: {
    project_id: string;
    edit_id: string;
    preview?: boolean;
    quality?: string;
    encoder?: string;
  }) =>
    request<{ job: Job }>("/api/render", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getRender: (renderId: string, projectId: string) =>
    request<{ render: RenderInfo; project_id: string }>(
      `/api/renders/${renderId}?project_id=${encodeURIComponent(projectId)}`,
    ),
  deleteRender: (renderId: string, projectId: string) =>
    request<{ ok: boolean }>(`/api/renders/${renderId}?project_id=${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    }),

  downloadZip: async (projectId: string, renderIds: string[] = []) => {
    const response = await fetch("/api/download/zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, render_ids: renderIds }),
    });
    if (!response.ok) {
      let message = "No se pudo crear el ZIP.";
      try {
        const payload = (await response.json()) as Json;
        const err = payload?.error as Json | undefined;
        message = String(err?.message || message);
      } catch {
        /* ignore */
      }
      throw new ApiError(message, "zip_error", response.status);
    }
    return response.blob();
  },
};

export const mediaUrl = (projectId: string, path: string) =>
  `/api/files/${projectId}/${path.split("/").map(encodeURIComponent).join("/")}`;

export const downloadUrl = (projectId: string, renderId: string) =>
  `/api/download/${renderId}?project_id=${encodeURIComponent(projectId)}`;

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function waitForJob(
  jobId: string,
  onUpdate: (job: Job) => void,
  signal?: AbortSignal,
  interval = 700,
): Promise<Job> {
  for (;;) {
    if (signal?.aborted) {
      throw new ApiError("Seguimiento cancelado.", "aborted");
    }
    const { job } = await api.getJob(jobId);
    onUpdate(job);
    if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
