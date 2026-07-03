import { createHash, randomUUID } from 'node:crypto';
import type { PromptInsert } from '@mirscope/database';
import type { RawPromptRecord } from '@mirscope/shared';
import { detectLanguage, extractUserFacingPrompt, isNoisePrompt } from '@mirscope/shared';

const TECH_KEYWORDS: Record<string, string[]> = {
  coding: ['code', 'function', 'bug', 'error', 'api', 'typescript', 'javascript', 'python', 'react', '代码', '函数', '报错', '接口'],
  writing: ['write', 'article', 'blog', 'essay', '文案', '文章', '写作'],
  analysis: ['analyze', 'analysis', 'data', 'chart', 'report', '分析', '数据', '报告'],
  design: ['design', 'ui', 'ux', 'layout', '设计', '界面'],
  devops: ['deploy', 'docker', 'kubernetes', 'ci', 'cd', '部署', '容器'],
};

/** 稳定去重键：仅按平台 + 会话 + 正文，不依赖 sourceId / timestamp */
export function computeHash(record: RawPromptRecord): string {
  const prompt = (record.prompt ?? '').trim();
  return createHash('sha256')
    .update(`${record.platform}|${record.conversationId}|${record.role}|${prompt}`)
    .digest('hex');
}

export function extractTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  for (const [tag, keywords] of Object.entries(TECH_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      tags.push(tag);
    }
  }
  return tags;
}

export function normalizeRecord(record: RawPromptRecord): PromptInsert | null {
  if (record.role !== 'user') return null;

  const rawPrompt = record.prompt?.trim() ?? '';
  const promptText = extractUserFacingPrompt(rawPrompt) || rawPrompt;

  if (!promptText) return null;
  if (isNoisePrompt(promptText)) return null;

  const promptTokens = record.promptTokens ?? null;
  const language = detectLanguage(promptText);
  const now = new Date();

  return {
    id: randomUUID(),
    conversationId: record.conversationId,
    platform: record.platform,
    workspace: record.workspace ?? null,
    project: record.project ?? null,
    projectPath: record.projectPath ?? null,
    filePath: record.filePath ?? null,
    provider: record.provider ?? inferProvider(record.model),
    model: record.model ?? null,
    role: 'user',
    prompt: promptText,
    response: null,
    promptTokens,
    responseTokens: null,
    latency: record.latency ?? null,
    responseStatus: null,
    timestamp: record.timestamp,
    sessionDuration: record.sessionDuration ?? null,
    language,
    costEstimate: null,
    reuseCount: 0,
    favorite: false,
    score: null,
    optimizedVersion: null,
    optimizationNotes: null,
    tags: extractTags(promptText),
    hash: computeHash({ ...record, prompt: promptText }),
    createdAt: now,
    updatedAt: now,
  };
}

function inferProvider(model?: string): string | null {
  if (!model) return null;
  const lower = model.toLowerCase();
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) return 'openai';
  if (lower.includes('claude')) return 'anthropic';
  if (lower.includes('gemini')) return 'google';
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('qwen')) return 'alibaba';
  return null;
}

export function normalizeRecords(records: RawPromptRecord[]): PromptInsert[] {
  const seen = new Set<string>();
  const normalized: PromptInsert[] = [];

  for (const record of records) {
    const item = normalizeRecord(record);
    if (!item) continue;
    if (seen.has(item.hash)) continue;
    seen.add(item.hash);
    normalized.push(item);
  }

  return normalized;
}

export class NormalizationEngine {
  normalize(records: RawPromptRecord[]): PromptInsert[] {
    return normalizeRecords(records);
  }
}
