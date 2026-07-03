import { BrowserWindow, ipcMain } from 'electron';
import { AnalyticsEngine } from '@mirscope/analytics';
import { createAIProvider } from '@mirscope/ai-provider';
import {
  exportAllPrompts,
  getPromptById,
  getProjectProfileStats,
  getProjectPromptSamples,
  getSetting,
  getTemplatePrompts,
  saveSetting,
  toggleFavorite,
  updatePromptOptimization,
  updatePromptScore,
} from '@mirscope/database';
import type { AIProviderConfig, AppPreferences, ExportFormat, SearchFilters } from '@mirscope/shared';
import type { ConnectorManager } from './connector-manager.js';
import { backupDatabase, exportPromptsToFile } from './export.js';
import { parsePreferences } from './preferences.js';
import { decryptAIConfig, encryptAIConfig } from './secure-settings.js';

const analytics = new AnalyticsEngine();

function parseAIConfig(raw: string | null) {
  return decryptAIConfig(raw);
}

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

export function registerIpcHandlers(manager: ConnectorManager): void {
  manager.setOnDataChange(() => {
    analytics.invalidateCache();
    broadcast('data:changed');
  });

  ipcMain.handle('connectors:list', () => manager.listConnectors());
  ipcMain.handle('connectors:detect', () => manager.detectAll());
  ipcMain.handle('connectors:syncAll', () => manager.syncAll());
  ipcMain.handle('connectors:sync', (_event, id: string) => manager.syncOne(id));
  ipcMain.handle('connectors:cancelSync', () => {
    manager.cancelSync();
    return true;
  });

  ipcMain.handle('analytics:dashboard', () => analytics.getDashboardStats());
  ipcMain.handle('analytics:timeline', (_event, limit = 100, offset = 0) => {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 200);
    const safeOffset = Math.max(0, Number(offset) || 0);
    return analytics.getTimeline(safeLimit, safeOffset);
  });
  ipcMain.handle('analytics:timelineQuery', (_event, query = {}) => {
    const q = query as Record<string, unknown>;
    const safeLimit = Math.min(Math.max(1, Number(q.limit) || 50), 200);
    const safeOffset = Math.max(0, Number(q.offset) || 0);
    return analytics.queryTimeline({
      platform: typeof q.platform === 'string' ? q.platform : undefined,
      project: typeof q.project === 'string' ? q.project : undefined,
      dateFrom: typeof q.dateFrom === 'string' ? q.dateFrom : undefined,
      dateTo: typeof q.dateTo === 'string' ? q.dateTo : undefined,
      limit: safeLimit,
      offset: safeOffset,
    });
  });
  ipcMain.handle('analytics:timelineNav', () => analytics.getTimelineNav());
  ipcMain.handle('analytics:projectProfile', (_event, platform: string, project: string) => {
    if (!platform || !project) throw new Error('platform and project are required');
    return analytics.getProjectProfile(platform, project);
  });
  ipcMain.handle('analytics:projectPlaybook', async (_event, platform: string, project: string) => {
    if (!platform || !project) throw new Error('platform and project are required');
    const [stats, samples] = await Promise.all([
      getProjectProfileStats(platform, project),
      getProjectPromptSamples(platform, project, 25),
    ]);
    if (stats.promptCount === 0) {
      throw new Error('该项目暂无有效 Prompt 样本');
    }
    const configRaw = await getSetting('ai_provider');
    const config = parseAIConfig(configRaw);
    const provider = createAIProvider(config);
    return provider.generateProjectPlaybook(stats, samples);
  });
  ipcMain.handle('analytics:heatmap', () => analytics.getHeatmap());
  ipcMain.handle('analytics:wordcloud', (_event, limit = 100) => analytics.getWordCloud(limit));

  ipcMain.handle('prompts:search', (_event, filters: SearchFilters) => {
    const safeFilters = {
      ...filters,
      limit: Math.min(Math.max(1, filters.limit ?? 50), 200),
    };
    return analytics.search(safeFilters);
  });
  ipcMain.handle('prompts:get', (_event, id: string) => getPromptById(id));
  ipcMain.handle('prompts:templates', async (_event, minScore?: number, limit = 50) => {
    const prefs = parsePreferences(await getSetting('app_preferences'));
    return getTemplatePrompts(minScore ?? prefs.templateMinScore, limit);
  });
  ipcMain.handle('prompts:toggleFavorite', (_event, id: string) => toggleFavorite(id));

  ipcMain.handle('prompts:score', async (_event, id: string) => {
    const prompt = await getPromptById(id);
    if (!prompt?.prompt) throw new Error('Prompt not found');

    const configRaw = await getSetting('ai_provider');
    const config = parseAIConfig(configRaw);
    const provider = createAIProvider(config);
    const result = await provider.scorePrompt(prompt.prompt);

    await updatePromptScore(
      id,
      result.score,
      [...result.deductions, ...result.suggestions].join('\n')
    );

    return result;
  });

  ipcMain.handle('prompts:rewrite', async (_event, id: string) => {
    const prompt = await getPromptById(id);
    if (!prompt?.prompt) throw new Error('Prompt not found');

    const configRaw = await getSetting('ai_provider');
    const config = parseAIConfig(configRaw);
    const provider = createAIProvider(config);
    const result = await provider.rewritePrompt(prompt.prompt);

    await updatePromptOptimization(
      id,
      result.optimizedPrompt,
      result.reasons.join('\n')
    );

    return result;
  });

  ipcMain.handle('data:export', async (_event, format: ExportFormat) => {
    const prompts = await exportAllPrompts();
    return exportPromptsToFile(prompts, format);
  });

  ipcMain.handle('data:backup', () => backupDatabase());

  ipcMain.handle('settings:get', async () => {
    const aiProvider = await getSetting('ai_provider');
    const preferences = await getSetting('app_preferences');
    return {
      aiProvider: parseAIConfig(aiProvider),
      preferences: parsePreferences(preferences),
    };
  });

  ipcMain.handle(
    'settings:save',
    async (
      _event,
      settings: { aiProvider: AIProviderConfig; preferences?: AppPreferences }
    ) => {
      await saveSetting('ai_provider', encryptAIConfig(settings.aiProvider));
      if (settings.preferences) {
        await saveSetting('app_preferences', JSON.stringify(settings.preferences));
      }
      analytics.invalidateCache();
      return true;
    }
  );
}
