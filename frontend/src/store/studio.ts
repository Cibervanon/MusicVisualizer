import { create } from "zustand";

import { api, ApiError } from "../lib/api";
import type {
  Capabilities,
  Job,
  Project,
  ProjectListItem,
  Step,
  StylePreset,
  StudioConfig,
  TextPreset,
} from "../lib/types";

const STORAGE_KEY = "lumen.project";

interface Toast {
  id: number;
  message: string;
  kind: "success" | "error" | "info";
}

interface StudioState {
  booted: boolean;
  loadingProject: boolean;
  step: Step;
  project: Project | null;
  projects: ProjectListItem[];
  capabilities: Capabilities | null;
  styles: StylePreset[];
  lyricPresets: TextPreset[];
  animations: string[];
  fonts: string[];
  config: StudioConfig;
  fragment: { start: number; end: number };
  job: Job | null;
  selectedEditId: string | null;
  toast: Toast | null;

  init: () => Promise<void>;
  notify: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: () => void;
  createProject: (name: string) => Promise<Project | null>;
  openProject: (id: string, preferredStep?: Step) => Promise<void>;
  refreshProject: () => Promise<void>;
  setStep: (step: Step) => void;
  setConfig: (patch: Partial<StudioConfig>) => void;
  setFragment: (start: number, end: number) => void;
  setJob: (job: Job | null) => void;
  setSelectedEdit: (editId: string | null) => void;
  reset: () => void;
}

const DEFAULT_CONFIG: StudioConfig = {
  count: 3,
  duration: 30,
  format: "9:16",
  resolution: "1080p",
  fps: 30,
  quality: "balanced",
  encoder: "cpu",
  seed: 20261107,
  styles: [],
};

function normalizeConfig(project: Project): StudioConfig {
  const raw = project.config || ({} as StudioConfig);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    styles: Array.isArray(raw.styles) ? raw.styles : [],
    duration: project.fragment?.duration || raw.duration || DEFAULT_CONFIG.duration,
  };
}

function decideStep(project: Project): Step {
  if ((project.renders || []).some((render) => render.type === "final")) return "results";
  if (project.audio && project.video) return "customize";
  return "setup";
}

export const useStudio = create<StudioState>()((set, get) => ({
  booted: false,
  loadingProject: false,
  step: "setup",
  project: null,
  projects: [],
  capabilities: null,
  styles: [],
  lyricPresets: [],
  animations: [],
  fonts: [],
  config: DEFAULT_CONFIG,
  fragment: { start: 0, end: 30 },
  job: null,
  selectedEditId: null,
  toast: null,

  notify: (message, kind = "info") =>
    set({ toast: { id: Date.now(), message, kind } }),
  dismissToast: () => set({ toast: null }),

  init: async () => {
    const [capabilities, styles, presets, projects] = await Promise.allSettled([
      api.capabilities(),
      api.styles(),
      api.lyricPresets(),
      api.listProjects(),
    ]);

    set({
      capabilities: capabilities.status === "fulfilled" ? capabilities.value : null,
      styles: styles.status === "fulfilled" ? styles.value.styles : [],
      lyricPresets: presets.status === "fulfilled" ? presets.value.presets : [],
      animations: presets.status === "fulfilled" ? presets.value.animations : [],
      fonts: presets.status === "fulfilled" ? presets.value.fonts : [],
      projects: projects.status === "fulfilled" ? projects.value.projects : [],
      booted: true,
    });

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        await get().openProject(stored);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  },

  createProject: async (name) => {
    try {
      const { project } = await api.createProject(name || "Nuevo proyecto");
      localStorage.setItem(STORAGE_KEY, project.id);
      set({
        project,
        config: normalizeConfig(project),
        fragment: { start: 0, end: project.audio?.duration || 30 },
        step: "setup",
        selectedEditId: null,
        job: null,
      });
      set((state) => ({
        projects: [
          {
            id: project.id,
            name: project.name,
            created_at: project.created_at,
            updated_at: project.updated_at,
            has_audio: false,
            has_video: false,
            renders: 0,
          },
          ...state.projects.filter((item) => item.id !== project.id),
        ],
      }));
      return project;
    } catch (error) {
      get().notify((error as ApiError).message, "error");
      return null;
    }
  },

  openProject: async (id, preferredStep) => {
    set({ loadingProject: true });
    try {
      const { project } = await api.getProject(id);
      localStorage.setItem(STORAGE_KEY, project.id);
      const start = project.fragment?.start ?? 0;
      const end = project.fragment?.end ?? project.audio?.duration ?? 30;
      set({
        project,
        config: normalizeConfig(project),
        fragment: { start, end },
        step: preferredStep || decideStep(project),
        selectedEditId: null,
        job: null,
      });
    } catch (error) {
      get().notify((error as ApiError).message, "error");
      throw error;
    } finally {
      set({ loadingProject: false });
    }
  },

  refreshProject: async () => {
    const current = get().project;
    if (!current) return;
    try {
      const { project } = await api.getProject(current.id);
      set((state) => ({
        project,
        config: { ...state.config, duration: project.fragment?.duration || state.config.duration },
      }));
    } catch {
      /* la UI mantiene el último estado conocido */
    }
  },

  setStep: (step) => set({ step }),
  setConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),
  setFragment: (start, end) =>
    set((state) => ({
      fragment: { start, end },
      config: { ...state.config, duration: Math.max(0.1, end - start) },
    })),
  setJob: (job) => set({ job }),
  setSelectedEdit: (editId) => set({ selectedEditId: editId }),

  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({
      step: "setup",
      project: null,
      config: DEFAULT_CONFIG,
      fragment: { start: 0, end: 30 },
      job: null,
      selectedEditId: null,
    });
  },
}));
