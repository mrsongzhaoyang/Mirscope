export * from './types.js';

export function detectLanguage(
  text: string,
  thresholds: { mixed?: number; chinese?: number } = {}
): '中文' | '英文' | '混合' {
  if (!text?.trim()) return '英文';
  const mixedThreshold = thresholds.mixed ?? 0.3;
  const chineseThreshold = thresholds.chinese ?? 0.7;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const total = text.replace(/\s/g, '').length || 1;
  const ratio = chineseChars / total;
  if (ratio > mixedThreshold) return ratio > chineseThreshold ? '中文' : '混合';
  return '英文';
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

export function estimateCost(
  promptTokens: number,
  responseTokens: number,
  model?: string | null
): number {
  const rates: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'claude-3-5-sonnet': { input: 3, output: 15 },
    'claude-3-opus': { input: 15, output: 75 },
    'deepseek-chat': { input: 0.14, output: 0.28 },
    default: { input: 1, output: 3 },
  };
  const key = Object.keys(rates).find((k) => model?.toLowerCase().includes(k)) ?? 'default';
  const rate = rates[key] ?? rates.default;
  return (promptTokens * rate.input + responseTokens * rate.output) / 1_000_000;
}

export function truncate(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

/** Cursor Agent / Subagent 自动下发的任务指令（非用户真实提问） */
export function isAgentInjectedPrompt(text: string | null | undefined): boolean {
  const t = text?.trim();
  if (!t) return false;
  if (/^Explore the .+ to understand:/i.test(t)) return true;
  if (/^Investigate .+ by examining:/i.test(t)) return true;
  if (/^Run # GitHub Actions/i.test(t)) return true;
  if (/The user reports the entire app/i.test(t)) return true;
  if (/Find likely causes by examining:/i.test(t)) return true;
  if (/subagent_type/i.test(t)) return true;
  if (/^Briefly inform the user about the task result/i.test(t)) return true;
  if (/^Read the skill at/i.test(t) && /FOLLOW/i.test(t)) return true;
  if (/\bReturn:\s*[\s\S]{0,200}(file paths|architecture|summary)/i.test(t)) return true;
  if (/npm error code EUSAGE/i.test(t) && /npm ci/i.test(t)) return true;
  return false;
}

/** Cursor / IDE 自动注入的非用户 Prompt（系统通知、后台任务等） */
export function isNoisePrompt(text: string | null | undefined): boolean {
  const t = text?.trim();
  if (!t) return true;
  if (isAgentInjectedPrompt(t)) return true;
  if (isMostlyEnglishPrompt(t)) return true;
  if (/<system_notification>/i.test(t)) return true;
  if (/^<system_[^>]+>/i.test(t)) return true;
  if (/The following task has finished/i.test(t) && /<task>/i.test(t)) return true;
  return false;
}

/** 从 Cursor 用户消息中提取真实提问，去掉 IDE 注入的上下文块 */
export function extractUserFacingPrompt(text: string | null | undefined): string {
  if (!text?.trim()) return '';

  const userQuery = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  if (userQuery?.[1]?.trim()) return userQuery[1].trim();

  let cleaned = text
    .replace(/<timestamp>[\s\S]*?<\/timestamp>/gi, '')
    .replace(/<open_and_recently_viewed_files>[\s\S]*?<\/open_and_recently_viewed_files>/gi, '')
    .replace(/<attached_files>[\s\S]*?<\/attached_files>/gi, '')
    .replace(/<user_rules>[\s\S]*?<\/user_rules>/gi, '')
    .replace(/<agent_skills>[\s\S]*?<\/agent_skills>/gi, '')
    .replace(/<agent_transcripts>[\s\S]*?<\/agent_transcripts>/gi, '')
    .replace(/<system_notification>[\s\S]*?<\/system_notification>/gi, '')
    .replace(/<[^>\n]+>[\s\S]*?<\/[^>\n]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned || text.trim();
}

/** 以用户可见正文判断：中文占比极低且拉丁字母占多数 */
export function isMostlyEnglishPrompt(text: string | null | undefined): boolean {
  const facing = extractUserFacingPrompt(text);
  const t = facing || text?.trim();
  if (!t || t.length < 20) return false;

  if (detectLanguage(t) === '英文') return true;

  const chineseChars = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinChars = (t.match(/[a-zA-Z]/g) || []).length;
  const total = t.replace(/\s/g, '').length || 1;
  return t.length >= 40 && chineseChars / total < 0.1 && latinChars / total > 0.45;
}

export const PROMPT_TASK_LABELS: Record<string, string> = {
  debug: '调试修复',
  refactor: '重构整理',
  performance: '性能优化',
  feature: '新功能开发',
  qa: '问答咨询',
  other: '其他',
};

/** 基于关键词的 Prompt 任务类型粗分类（项目级统计用） */
export function classifyPromptTask(text: string | null | undefined): keyof typeof PROMPT_TASK_LABELS {
  const t = text?.trim().toLowerCase() ?? '';
  if (!t) return 'other';
  if (/报错|错误|error|bug|fix|修复|失败|异常|crash|报错|不工作/.test(t)) return 'debug';
  if (/重构|refactor|rename|移动|抽取|拆分/.test(t)) return 'refactor';
  if (/性能|performance|慢|lag|卡顿|优化速度|memory|内存/.test(t)) return 'performance';
  if (/实现|创建|添加|新建|开发|implement|create |add |build |写一个/.test(t)) return 'feature';
  if (/怎么|为什么|是什么|what |how |why |explain|解释|能否|可以吗/.test(t)) return 'qa';
  return 'other';
}

export function formatDate(date: Date): string {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function gradeFromScore(score: number): 'A+' | 'A' | 'B' | 'C' {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  return 'C';
}

export interface DiffLine {
  type: 'same' | 'add' | 'remove';
  text: string;
}

/** 简易行级 diff，用于 Prompt 优化对比 */
export function diffLines(original: string, revised: string): DiffLine[] {
  const a = original.split('\n');
  const b = revised.split('\n');
  const result: DiffLine[] = [];
  const maxLen = Math.max(a.length, b.length);

  for (let i = 0; i < maxLen; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      if (left !== undefined) result.push({ type: 'same', text: left });
    } else {
      if (left !== undefined) result.push({ type: 'remove', text: left });
      if (right !== undefined) result.push({ type: 'add', text: right });
    }
  }
  return result;
}
