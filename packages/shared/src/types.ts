export type PromptRole = 'user' | 'assistant' | 'system';
export type ResponseStatus = 'success' | 'error' | 'timeout';

export interface RawPromptRecord {
  conversationId: string;
  platform: string;
  workspace?: string;
  project?: string;
  projectPath?: string;
  filePath?: string;
  provider?: string;
  model?: string;
  role: PromptRole;
  prompt?: string;
  response?: string;
  promptTokens?: number;
  responseTokens?: number;
  latency?: number;
  responseStatus?: ResponseStatus;
  timestamp: Date;
  sessionDuration?: number;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedPrompt {
  id: string;
  conversationId: string;
  platform: string;
  workspace: string | null;
  project: string | null;
  projectPath: string | null;
  filePath: string | null;
  provider: string | null;
  model: string | null;
  role: PromptRole;
  prompt: string | null;
  response: string | null;
  promptTokens: number | null;
  responseTokens: number | null;
  latency: number | null;
  responseStatus: ResponseStatus | null;
  timestamp: Date;
  sessionDuration: number | null;
  language: string | null;
  costEstimate: number | null;
  reuseCount: number;
  favorite: boolean;
  score: number | null;
  optimizedVersion: string | null;
  optimizationNotes: string | null;
  tags: string[];
  hash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectorSyncState {
  platform: string;
  lastRecordId: string | null;
  lastSyncTime: Date | null;
  lastHash: string | null;
  version: string;
}

export interface ConnectorDetectResult {
  installed: boolean;
  dataPaths: string[];
  message?: string;
}

export interface ConnectorManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  supportedPlatforms: Array<'win32' | 'darwin' | 'linux'>;
}

export interface ParsedConversation {
  id: string;
  name?: string;
  workspacePath?: string;
  projectPath?: string;
  createdAt?: Date;
  updatedAt?: Date;
  messages: ParsedMessage[];
}

export interface ParsedMessage {
  id: string;
  role: PromptRole;
  content: string;
  timestamp?: Date;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface DashboardStats {
  totalPrompts: number;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  avgPromptLength: number;
  totalTokens: number;
  totalCost: number;
  platformBreakdown: Array<{ platform: string; count: number }>;
  modelBreakdown: Array<{ model: string; count: number }>;
}

export interface TimelineEntry {
  id: string;
  conversationId: string;
  platform: string;
  project: string | null;
  prompt: string | null;
  model: string | null;
  timestamp: Date;
  score: number | null;
}

export interface TimelineQuery {
  platform?: string;
  project?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface TimelinePage {
  items: TimelineEntry[];
  total: number;
}

export interface TimelineNavProject {
  name: string;
  count: number;
}

export interface TimelineNavGroup {
  platform: string;
  count: number;
  projects: TimelineNavProject[];
}

export interface ProjectProfileQuery {
  platform: string;
  project: string;
}

export interface ProjectTaskTypeBreakdown {
  type: string;
  label: string;
  count: number;
  percentage: number;
}

export interface ProjectProfileStats {
  platform: string;
  project: string;
  projectPath: string | null;
  promptCount: number;
  conversationCount: number;
  avgPromptLength: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
  modelBreakdown: Array<{ model: string; count: number }>;
  taskTypeBreakdown: ProjectTaskTypeBreakdown[];
  topKeywords: Array<{ name: string; value: number }>;
  shortPromptRatio: number;
  chineseRatio: number;
}

export interface ProjectPlaybookTemplate {
  name: string;
  scenario: string;
  template: string;
}

export interface ProjectPlaybookResult {
  healthScore: number;
  grade: 'A+' | 'A' | 'B' | 'C';
  source: 'ai' | 'local' | 'fallback';
  styleProfile: string;
  strengths: string[];
  weaknesses: string[];
  patterns: Array<{ title: string; description: string; severity: 'high' | 'medium' | 'low' }>;
  suggestions: string[];
  templates: ProjectPlaybookTemplate[];
  sampleCount: number;
}

export interface ProjectPromptSample {
  prompt: string;
  timestamp: Date;
  model: string | null;
}

export interface HeatmapData {
  hour: number;
  day: number;
  count: number;
}

export interface SearchFilters {
  query?: string;
  platform?: string;
  model?: string;
  dateFrom?: string;
  dateTo?: string;
  favorite?: boolean;
  limit?: number;
  offset?: number;
}

export interface PromptScoreResult {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C';
  source: 'ai' | 'local' | 'fallback';
  dimensions: {
    clarity: number;
    context: number;
    format: number;
    role: number;
    constraints: number;
    executability: number;
  };
  deductions: string[];
  suggestions: string[];
}

export interface PromptRewriteResult {
  optimizedPrompt: string;
  reasons: string[];
  source?: 'ai' | 'local' | 'fallback';
  originalScore?: number;
  optimizedScore?: number;
}

export interface AIProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface AppPreferences {
  wordCloudLimit: number;
  templateMinScore: number;
  languageMixedThreshold: number;
  languageChineseThreshold: number;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  wordCloudLimit: 60,
  templateMinScore: 85,
  languageMixedThreshold: 0.3,
  languageChineseThreshold: 0.7,
};

export interface SyncProgress {
  stage: 'fetch' | 'normalize' | 'save' | 'done' | 'cancelled';
  platform: string;
  progress: number;
  message: string;
}

export type ExportFormat = 'json' | 'csv';

export type IPCChannel =
  | 'connectors:list'
  | 'connectors:detect'
  | 'connectors:sync'
  | 'connectors:syncAll'
  | 'analytics:dashboard'
  | 'analytics:timeline'
  | 'analytics:heatmap'
  | 'analytics:wordcloud'
  | 'prompts:search'
  | 'prompts:get'
  | 'prompts:toggleFavorite'
  | 'prompts:score'
  | 'prompts:rewrite'
  | 'settings:get'
  | 'settings:save';
