import { create } from 'zustand';
import type { DashboardStats, NormalizedPrompt, SyncProgress, TimelineEntry } from '@mirscope/shared';

const DASHBOARD_CACHE_MS = 30_000;
const TIMELINE_PAGE = 50;

interface AppState {
  syncing: boolean;
  syncProgress: SyncProgress | null;
  dashboard: DashboardStats | null;
  timeline: TimelineEntry[];
  timelineHasMore: boolean;
  prompts: NormalizedPrompt[];
  lastSyncTime: Date | null;
  dashboardCachedAt: number;

  syncAll: () => Promise<void>;
  cancelSync: () => void;
  loadDashboard: (force?: boolean) => Promise<void>;
  loadTimeline: (limit?: number) => Promise<void>;
  loadMoreTimeline: () => Promise<boolean>;
  patchTimelineEntry: (id: string, patch: Partial<TimelineEntry>) => void;
  invalidateCache: () => void;
  setSyncProgress: (progress: SyncProgress | null) => void;
  searchPrompts: (query: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  syncing: false,
  syncProgress: null,
  dashboard: null,
  timeline: [],
  timelineHasMore: true,
  prompts: [],
  lastSyncTime: null,
  dashboardCachedAt: 0,

  setSyncProgress: (syncProgress) => set({ syncProgress }),

  invalidateCache: () => set({ dashboardCachedAt: 0 }),

  cancelSync: () => {
    void window.mirscope.connectors.cancelSync();
  },

  syncAll: async () => {
    set({ syncing: true, syncProgress: null });
    try {
      await window.mirscope.connectors.syncAll();
      set({ lastSyncTime: new Date() });
      get().invalidateCache();
      await get().loadDashboard(true);
      await get().loadTimeline(TIMELINE_PAGE);
    } finally {
      set({ syncing: false, syncProgress: null });
    }
  },

  loadDashboard: async (force = false) => {
    const now = Date.now();
    const { dashboard, dashboardCachedAt } = get();
    if (!force && dashboard && now - dashboardCachedAt < DASHBOARD_CACHE_MS) return;

    const next = await window.mirscope.analytics.dashboard();
    set({ dashboard: next, dashboardCachedAt: now });
  },

  loadTimeline: async (limit = TIMELINE_PAGE) => {
    const timeline = await window.mirscope.analytics.timeline(limit, 0);
    set({ timeline, timelineHasMore: timeline.length >= limit });
  },

  loadMoreTimeline: async () => {
    const { timeline } = get();
    const batch = await window.mirscope.analytics.timeline(TIMELINE_PAGE, timeline.length);
    if (batch.length === 0) {
      set({ timelineHasMore: false });
      return false;
    }
    set({
      timeline: [...timeline, ...batch],
      timelineHasMore: batch.length >= TIMELINE_PAGE,
    });
    return batch.length >= TIMELINE_PAGE;
  },

  patchTimelineEntry: (id, patch) => {
    set((s) => ({
      timeline: s.timeline.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  },

  searchPrompts: async (query: string) => {
    const prompts = await window.mirscope.prompts.search({ query, limit: 40 });
    set({ prompts });
  },
}));
