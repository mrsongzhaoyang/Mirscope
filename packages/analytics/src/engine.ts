import {
  getHeatmapData,
  getModelBreakdown,
  getPlatformBreakdown,
  getProjectProfileStats,
  getProjectPromptSamples,
  getPromptCount,
  getStatsInRange,
  getTimeline,
  getTimelineNav,
  getWordCloudData,
  queryTimeline as queryTimelineDb,
  searchPrompts,
} from '@mirscope/database';
import type {
  DashboardStats,
  ProjectProfileStats,
  SearchFilters,
  TimelineEntry,
  TimelineNavGroup,
  TimelinePage,
  TimelineQuery,
} from '@mirscope/shared';

const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  promptCount: number;
  cachedAt: number;
}

export class AnalyticsEngine {
  private heatmapCache: CacheEntry<Array<{ hour: number; day: number; count: number }>> | null =
    null;
  private wordCloudCache = new Map<number, CacheEntry<Array<{ name: string; value: number }>>>();

  invalidateCache(): void {
    this.heatmapCache = null;
    this.wordCloudCache.clear();
  }

  private async isCacheValid<T>(entry: CacheEntry<T> | null | undefined): Promise<boolean> {
    if (!entry) return false;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return false;
    const count = await getPromptCount();
    return entry.promptCount === count;
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalPrompts, today, week, month, platformBreakdown, modelBreakdown] =
      await Promise.all([
        getPromptCount(),
        getStatsInRange(dayStart),
        getStatsInRange(weekStart),
        getStatsInRange(monthStart),
        getPlatformBreakdown(),
        getModelBreakdown(),
      ]);

    const allTime = await getStatsInRange(new Date(0));

    return {
      totalPrompts,
      todayCount: today.count,
      weekCount: week.count,
      monthCount: month.count,
      avgPromptLength: Math.round(allTime.avgLength),
      totalTokens: 0,
      totalCost: 0,
      platformBreakdown,
      modelBreakdown,
    };
  }

  async getTimeline(limit = 100, offset = 0): Promise<TimelineEntry[]> {
    return getTimeline(limit, offset);
  }

  async queryTimeline(filters: TimelineQuery = {}): Promise<TimelinePage> {
    return queryTimelineDb(filters);
  }

  async getTimelineNav(): Promise<TimelineNavGroup[]> {
    return getTimelineNav();
  }

  async getProjectProfile(platform: string, project: string): Promise<ProjectProfileStats> {
    return getProjectProfileStats(platform, project);
  }

  async getProjectSamples(platform: string, project: string, limit = 25) {
    return getProjectPromptSamples(platform, project, limit);
  }

  async search(filters: SearchFilters) {
    return searchPrompts(filters);
  }

  async getHeatmap() {
    if (await this.isCacheValid(this.heatmapCache)) {
      return this.heatmapCache!.data;
    }
    const [data, promptCount] = await Promise.all([getHeatmapData(), getPromptCount()]);
    this.heatmapCache = { data, promptCount, cachedAt: Date.now() };
    return data;
  }

  async getWordCloud(limit = 100) {
    const cached = this.wordCloudCache.get(limit);
    if (await this.isCacheValid(cached)) {
      return cached!.data;
    }
    const [data, promptCount] = await Promise.all([getWordCloudData(limit), getPromptCount()]);
    this.wordCloudCache.set(limit, { data, promptCount, cachedAt: Date.now() });
    return data;
  }
}
