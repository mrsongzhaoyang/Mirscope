import { contextBridge, ipcRenderer } from 'electron';
import type {
  AIProviderConfig,
  AppPreferences,
  ConnectorManifest,
  DashboardStats,
  ExportFormat,
  NormalizedPrompt,
  PromptRewriteResult,
  PromptScoreResult,
  SearchFilters,
  SyncProgress,
  TimelineEntry,
  TimelineNavGroup,
  TimelinePage,
  TimelineQuery,
  ProjectProfileStats,
  ProjectPlaybookResult,
} from '@mirscope/shared';

export interface MirscopeAPI {
  connectors: {
    list: () => Promise<Array<ConnectorManifest & { enabled: boolean }>>;
    detect: () => Promise<
      Array<{
        id: string;
        name: string;
        installed: boolean;
        dataPaths: string[];
        message?: string;
      }>
    >;
    syncAll: () => Promise<
      Array<{ platform: string; imported: number; skipped: number; syncTime: Date; cancelled?: boolean }>
    >;
    sync: (id: string) => Promise<{
      platform: string;
      imported: number;
      skipped: number;
      syncTime: Date;
      cancelled?: boolean;
    }>;
    cancelSync: () => Promise<boolean>;
  };
  analytics: {
    dashboard: () => Promise<DashboardStats>;
    timeline: (limit?: number, offset?: number) => Promise<TimelineEntry[]>;
    timelineQuery: (query?: TimelineQuery) => Promise<TimelinePage>;
    timelineNav: () => Promise<TimelineNavGroup[]>;
    projectProfile: (platform: string, project: string) => Promise<ProjectProfileStats>;
    projectPlaybook: (platform: string, project: string) => Promise<ProjectPlaybookResult>;
    heatmap: () => Promise<Array<{ hour: number; day: number; count: number }>>;
    wordcloud: (limit?: number) => Promise<Array<{ name: string; value: number }>>;
  };
  prompts: {
    search: (filters: SearchFilters) => Promise<NormalizedPrompt[]>;
    get: (id: string) => Promise<NormalizedPrompt | null>;
    templates: (minScore?: number, limit?: number) => Promise<NormalizedPrompt[]>;
    toggleFavorite: (id: string) => Promise<boolean>;
    score: (id: string) => Promise<PromptScoreResult>;
    rewrite: (id: string) => Promise<PromptRewriteResult>;
  };
  data: {
    export: (format: ExportFormat) => Promise<{ ok: boolean; path?: string; error?: string }>;
    backup: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  };
  settings: {
    get: () => Promise<{ aiProvider: AIProviderConfig; preferences: AppPreferences }>;
    save: (settings: { aiProvider: AIProviderConfig; preferences?: AppPreferences }) => Promise<boolean>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<boolean>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
  platform: 'win32' | 'darwin' | 'linux' | 'freebsd' | 'openbsd' | 'sunos' | 'aix';
  onDataChanged: (callback: () => void) => () => void;
  onSyncProgress: (callback: (progress: SyncProgress) => void) => () => void;
}

const api: MirscopeAPI = {
  connectors: {
    list: () => ipcRenderer.invoke('connectors:list'),
    detect: () => ipcRenderer.invoke('connectors:detect'),
    syncAll: () => ipcRenderer.invoke('connectors:syncAll'),
    sync: (id) => ipcRenderer.invoke('connectors:sync', id),
    cancelSync: () => ipcRenderer.invoke('connectors:cancelSync'),
  },
  analytics: {
    dashboard: () => ipcRenderer.invoke('analytics:dashboard'),
    timeline: (limit, offset) => ipcRenderer.invoke('analytics:timeline', limit, offset),
    timelineQuery: (query) => ipcRenderer.invoke('analytics:timelineQuery', query),
    timelineNav: () => ipcRenderer.invoke('analytics:timelineNav'),
    projectProfile: (platform, project) =>
      ipcRenderer.invoke('analytics:projectProfile', platform, project),
    projectPlaybook: (platform, project) =>
      ipcRenderer.invoke('analytics:projectPlaybook', platform, project),
    heatmap: () => ipcRenderer.invoke('analytics:heatmap'),
    wordcloud: (limit) => ipcRenderer.invoke('analytics:wordcloud', limit),
  },
  prompts: {
    search: (filters) => ipcRenderer.invoke('prompts:search', filters),
    get: (id) => ipcRenderer.invoke('prompts:get', id),
    templates: (minScore, limit) => ipcRenderer.invoke('prompts:templates', minScore, limit),
    toggleFavorite: (id) => ipcRenderer.invoke('prompts:toggleFavorite', id),
    score: (id) => ipcRenderer.invoke('prompts:score', id),
    rewrite: (id) => ipcRenderer.invoke('prompts:rewrite', id),
  },
  data: {
    export: (format) => ipcRenderer.invoke('data:export', format),
    backup: () => ipcRenderer.invoke('data:backup'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  platform: process.platform,
  onDataChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('data:changed', handler);
    return () => ipcRenderer.removeListener('data:changed', handler);
  },
  onSyncProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: SyncProgress) => callback(progress);
    ipcRenderer.on('sync:progress', handler);
    return () => ipcRenderer.removeListener('sync:progress', handler);
  },
};

contextBridge.exposeInMainWorld('mirscope', api);

declare global {
  interface Window {
    mirscope: MirscopeAPI;
  }
}
