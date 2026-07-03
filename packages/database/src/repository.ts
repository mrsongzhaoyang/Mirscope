import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type {
  NormalizedPrompt,
  ProjectProfileStats,
  ProjectPromptSample,
  ProjectTaskTypeBreakdown,
  SearchFilters,
  TimelineEntry,
  TimelineNavGroup,
  TimelinePage,
  TimelineQuery,
} from '@mirscope/shared';
import {
  classifyPromptTask,
  extractUserFacingPrompt,
  isNoisePrompt,
  PROMPT_TASK_LABELS,
} from '@mirscope/shared';
import { getDatabase, getSqlite, type PromptInsert, prompts } from './db.js';

function rowToPrompt(row: typeof prompts.$inferSelect): NormalizedPrompt {
  return {
    id: row.id,
    conversationId: row.conversationId,
    platform: row.platform,
    workspace: row.workspace,
    project: row.project,
    projectPath: row.projectPath,
    filePath: row.filePath,
    provider: row.provider,
    model: row.model,
    role: row.role as NormalizedPrompt['role'],
    prompt: row.prompt,
    response: null,
    promptTokens: row.promptTokens,
    responseTokens: null,
    latency: row.latency,
    responseStatus: null,
    timestamp: row.timestamp,
    sessionDuration: row.sessionDuration,
    language: row.language,
    costEstimate: row.costEstimate,
    reuseCount: row.reuseCount,
    favorite: row.favorite,
    score: row.score,
    optimizedVersion: row.optimizedVersion,
    optimizationNotes: row.optimizationNotes,
    tags: row.tags ?? [],
    hash: row.hash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 从数据库物理删除 Cursor 系统通知等非用户 Prompt */
export async function purgeNoisePrompts(): Promise<number> {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare(`SELECT id, prompt FROM prompts WHERE role = 'user'`)
    .all() as Array<{ id: string; prompt: string | null }>;

  const ids = rows.filter((r) => isNoisePrompt(r.prompt)).map((r) => r.id);
  if (ids.length === 0) return 0;

  const deleteFts = sqlite.prepare(`DELETE FROM prompts_fts WHERE prompt_id = ?`);
  const deletePrompt = sqlite.prepare(`DELETE FROM prompts WHERE id = ?`);

  const purge = sqlite.transaction((toDelete: string[]) => {
    for (const id of toDelete) {
      deleteFts.run(id);
      deletePrompt.run(id);
    }
    return toDelete.length;
  });

  return purge(ids);
}

/** 清除 AI 回复数据，仅保留用户 Prompt */
export async function purgePromptResponses(): Promise<number> {
  const sqlite = getSqlite();
  const assistantRows = sqlite
    .prepare(`SELECT id FROM prompts WHERE role != 'user'`)
    .all() as Array<{ id: string }>;

  const deleteFts = sqlite.prepare(`DELETE FROM prompts_fts WHERE prompt_id = ?`);
  const deletePrompt = sqlite.prepare(`DELETE FROM prompts WHERE id = ?`);

  const purgeAssistants = sqlite.transaction((ids: string[]) => {
    for (const id of ids) {
      deleteFts.run(id);
      deletePrompt.run(id);
    }
    return ids.length;
  });

  const removedAssistants = assistantRows.length > 0 ? purgeAssistants(assistantRows.map((r) => r.id)) : 0;

  sqlite.prepare(`UPDATE prompts SET response = NULL, response_tokens = NULL, response_status = NULL`).run();
  sqlite.prepare(`UPDATE prompts_fts SET response = '' WHERE response != ''`).run();

  return removedAssistants;
}

export async function insertPrompts(records: PromptInsert[]): Promise<number> {
  if (records.length === 0) return 0;
  const sqlite = getSqlite();

  const insertStmt = sqlite.prepare(`
    INSERT OR IGNORE INTO prompts (
      id, conversation_id, platform, workspace, project, project_path, file_path,
      provider, model, role, prompt, response, prompt_tokens, response_tokens,
      latency, response_status, timestamp, session_duration, language, cost_estimate,
      reuse_count, favorite, score, optimized_version, optimization_notes, tags,
      hash, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  const insertFts = sqlite.prepare(`
    INSERT OR IGNORE INTO prompts_fts (prompt_id, prompt, response, project, platform)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMany = sqlite.transaction((items: PromptInsert[]) => {
    let inserted = 0;
    for (const record of items) {
      const result = insertStmt.run(
        record.id,
        record.conversationId,
        record.platform,
        record.workspace ?? null,
        record.project ?? null,
        record.projectPath ?? null,
        record.filePath ?? null,
        record.provider ?? null,
        record.model ?? null,
        record.role,
        record.prompt ?? null,
        record.response ?? null,
        record.promptTokens ?? null,
        record.responseTokens ?? null,
        record.latency ?? null,
        record.responseStatus ?? null,
        record.timestamp instanceof Date ? record.timestamp.getTime() : record.timestamp,
        record.sessionDuration ?? null,
        record.language ?? null,
        record.costEstimate ?? null,
        record.reuseCount ?? 0,
        record.favorite ? 1 : 0,
        record.score ?? null,
        record.optimizedVersion ?? null,
        record.optimizationNotes ?? null,
        JSON.stringify(record.tags ?? []),
        record.hash,
        record.createdAt instanceof Date ? record.createdAt.getTime() : record.createdAt,
        record.updatedAt instanceof Date ? record.updatedAt.getTime() : record.updatedAt
      );
      if (result.changes > 0) {
        insertFts.run(
          record.id,
          record.prompt ?? '',
          '',
          record.project ?? '',
          record.platform
        );
        inserted++;
      }
    }
    return inserted;
  });

  return insertMany(records);
}

/** 按 platform + conversation + prompt 内容去重，保留最早一条；并清理 hash 冲突的旧重复项 */
export async function dedupePrompts(): Promise<number> {
  const sqlite = getSqlite();
  const duplicateIds = sqlite
    .prepare(
      `SELECT id FROM (
         SELECT id,
                ROW_NUMBER() OVER (
                  PARTITION BY platform, conversation_id, trim(prompt)
                  ORDER BY timestamp ASC, created_at ASC
                ) AS rn
         FROM prompts
         WHERE role = 'user' AND prompt IS NOT NULL AND trim(prompt) != ''
       )
       WHERE rn > 1
       UNION
       SELECT id FROM (
         SELECT id,
                ROW_NUMBER() OVER (
                  PARTITION BY hash
                  ORDER BY timestamp ASC, created_at ASC
                ) AS rn
         FROM prompts
         WHERE role = 'user'
       )
       WHERE rn > 1`
    )
    .all() as Array<{ id: string }>;

  const uniqueIds = [...new Set(duplicateIds.map((r) => r.id))];
  if (uniqueIds.length === 0) return 0;

  const deleteFts = sqlite.prepare(`DELETE FROM prompts_fts WHERE prompt_id = ?`);
  const deletePrompt = sqlite.prepare(`DELETE FROM prompts WHERE id = ?`);

  const purge = sqlite.transaction((ids: string[]) => {
    for (const id of ids) {
      deleteFts.run(id);
      deletePrompt.run(id);
    }
    return ids.length;
  });

  return purge(uniqueIds);
}

export async function getPromptById(id: string): Promise<NormalizedPrompt | null> {
  const db = getDatabase();
  const rows = await db.select().from(prompts).where(eq(prompts.id, id)).limit(1);
  return rows[0] ? rowToPrompt(rows[0]) : null;
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const db = getDatabase();
  const existing = await getPromptById(id);
  if (!existing) return false;
  const next = !existing.favorite;
  await db
    .update(prompts)
    .set({ favorite: next, updatedAt: new Date() })
    .where(eq(prompts.id, id));
  return next;
}

export async function searchPrompts(filters: SearchFilters): Promise<NormalizedPrompt[]> {
  const db = getDatabase();
  const sqlite = getSqlite();
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  if (filters.query?.trim()) {
    const ftsQuery = filters.query
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t.replace(/"/g, '""')}"`)
      .join(' AND ');

    let sqlText = `
      SELECT p.* FROM prompts p
      INNER JOIN prompts_fts fts ON p.id = fts.prompt_id
      WHERE prompts_fts MATCH ?
    `;
    const params: unknown[] = [ftsQuery];

    if (filters.platform) {
      sqlText += ' AND p.platform = ?';
      params.push(filters.platform);
    }
    if (filters.model) {
      sqlText += ' AND p.model = ?';
      params.push(filters.model);
    }
    if (filters.favorite) {
      sqlText += ' AND p.favorite = 1';
    }
    if (filters.dateFrom) {
      sqlText += ' AND p.timestamp >= ?';
      params.push(new Date(filters.dateFrom).getTime());
    }
    if (filters.dateTo) {
      sqlText += ' AND p.timestamp <= ?';
      params.push(new Date(filters.dateTo).getTime());
    }

    sqlText += ' ORDER BY p.timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = sqlite.prepare(sqlText).all(...params) as Array<Record<string, unknown>>;
    return rows.map(mapRawRow).filter((p) => !isNoisePrompt(p.prompt));
  }

  const conditions = [];
  if (filters.platform) conditions.push(eq(prompts.platform, filters.platform));
  if (filters.model) conditions.push(eq(prompts.model, filters.model));
  if (filters.favorite) conditions.push(eq(prompts.favorite, true));
  if (filters.dateFrom) conditions.push(gte(prompts.timestamp, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(prompts.timestamp, new Date(filters.dateTo)));

  const query = db
    .select()
    .from(prompts)
    .orderBy(desc(prompts.timestamp))
    .limit(limit)
    .offset(offset);

  const rows =
    conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

  return rows.map(rowToPrompt).filter((p) => !isNoisePrompt(p.prompt));
}

function mapRawRow(row: Record<string, unknown>): NormalizedPrompt {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    platform: row.platform as string,
    workspace: (row.workspace as string) ?? null,
    project: (row.project as string) ?? null,
    projectPath: (row.project_path as string) ?? null,
    filePath: (row.file_path as string) ?? null,
    provider: (row.provider as string) ?? null,
    model: (row.model as string) ?? null,
    role: row.role as NormalizedPrompt['role'],
    prompt: (row.prompt as string) ?? null,
    response: null,
    promptTokens: (row.prompt_tokens as number) ?? null,
    responseTokens: null,
    latency: (row.latency as number) ?? null,
    responseStatus: null,
    timestamp: new Date(row.timestamp as number),
    sessionDuration: (row.session_duration as number) ?? null,
    language: (row.language as string) ?? null,
    costEstimate: (row.cost_estimate as number) ?? null,
    reuseCount: (row.reuse_count as number) ?? 0,
    favorite: Boolean(row.favorite),
    score: (row.score as number) ?? null,
    optimizedVersion: (row.optimized_version as string) ?? null,
    optimizationNotes: (row.optimization_notes as string) ?? null,
    tags: JSON.parse((row.tags as string) ?? '[]') as string[],
    hash: row.hash as string,
    createdAt: new Date(row.created_at as number),
    updatedAt: new Date(row.updated_at as number),
  };
}

function mapTimelineRow(r: {
  id: string;
  conversationId: string;
  platform: string;
  project: string | null;
  prompt: string | null;
  model: string | null;
  timestamp: Date;
  score: number | null;
}): TimelineEntry {
  return {
    id: r.id,
    conversationId: r.conversationId,
    platform: r.platform,
    project: r.project,
    prompt: r.prompt,
    model: r.model,
    timestamp: r.timestamp,
    score: r.score,
  };
}

function buildTimelineConditions(query: TimelineQuery) {
  const conditions = [eq(prompts.role, 'user')];
  if (query.platform) conditions.push(eq(prompts.platform, query.platform));
  if (query.project) conditions.push(eq(prompts.project, query.project));
  if (query.dateFrom) conditions.push(gte(prompts.timestamp, new Date(`${query.dateFrom}T00:00:00`)));
  if (query.dateTo) conditions.push(lte(prompts.timestamp, new Date(`${query.dateTo}T23:59:59`)));
  return conditions;
}

const WORD_CLOUD_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'it', 'its', 'they', 'them', 'their', '请', '的', '了',
  '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
  '看', '好', '自己', '这', '那', '他', '她', '它', '们', '吗', '吧',
  '啊', '呢', '哦', '嗯', '把', '被', '让', '给', '对', '从', '以',
  '及', '与', '或', '但', '而', '如果', '因为', '所以', '可以', '这个',
  '那个', '什么', '怎么', '如何', '为什么', '哪里', '哪个',
]);

const PHRASE_MIN_LEN = 2;
const PHRASE_MAX_LEN = 6;

/** 短片段需含请求/动作意图，避免姓名、业务名词碎片 */
const REQUEST_HINT =
  /帮|请|分析|修复|优化|实现|添加|创建|检查|写|改|删|生成|设计|部署|调试|重构|解释|怎么|如何|为什么|能否|可以|需要|给我|我想|继续|完成|排查|重启|启动|运行|测试|修改|替换|调整|迁移|升级|整理|总结|对比|review|fix|add|create|implement|help|debug|refactor|explain|how to/i;

const PHRASE_TOKEN_BLOCKLIST = new Set([
  'js', 'ts', 'vue', 'api', 'ai', 'exe', 'md', 'url', 'docker', 'sqlite',
  'electron', 'node', 'python', 'integer', 'varchar', 'voc', 'npm', 'pnpm',
  'git', 'json', 'yaml', 'http', 'https', 'www', 'com', 'cn', 'id', 'ui',
  'ux', 'css', 'html', 'sql', 'db', 'dev', 'prod', 'test', 'true', 'false',
]);

function extractPromptPhrase(raw: string): string | null {
  let text = extractUserFacingPrompt(raw) || raw;
  text = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  const firstLine = text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? text;
  const sentence = firstLine.split(/[。！？!?]/)[0]?.trim() ?? firstLine;
  let phrase = sentence.replace(/^[\s,，、；;：:]+/, '').trim();
  if (!phrase) return null;

  if (phrase.length > PHRASE_MAX_LEN) {
    phrase = phrase.slice(0, PHRASE_MAX_LEN);
  }

  return phrase.length >= PHRASE_MIN_LEN ? phrase : null;
}

function isPhraseNoise(phrase: string): boolean {
  const core = phrase.trim();
  if (!core) return true;

  const lower = core.toLowerCase();
  if (PHRASE_TOKEN_BLOCKLIST.has(lower)) return true;
  if (/^\d+$/.test(core)) return true;
  if (/^[a-z][a-z0-9_.-]{0,8}$/i.test(core)) return true;
  if (/^[\u4e00-\u9fff]{2,4}$/.test(core)) return true;

  const hanCount = (core.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latinCount = (core.match(/[a-zA-Z]/g) ?? []).length;
  if (hanCount === 0 && latinCount > 0 && core.length <= PHRASE_MAX_LEN) return true;

  if (core.length <= PHRASE_MAX_LEN && !REQUEST_HINT.test(core)) return true;
  return false;
}

/** 项目画像等场景：关键词统计 */
function tokenizePromptTexts(texts: string[], limit = 30): Array<{ name: string; value: number }> {
  const wordCount = new Map<string, number>();
  for (const raw of texts) {
    const text = extractUserFacingPrompt(raw) || raw;
    const words = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !WORD_CLOUD_STOP_WORDS.has(w));
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) ?? 0) + 1);
    }
  }
  return [...wordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

/** 看板词云：按真实 Prompt 首句/需求片段聚合 */
function buildPromptPhraseCloud(texts: string[], limit = 40): Array<{ name: string; value: number }> {
  const counts = new Map<string, number>();

  for (const raw of texts) {
    const phrase = extractPromptPhrase(raw);
    if (!phrase || isPhraseNoise(phrase) || isNoisePrompt(phrase)) continue;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const aHint = REQUEST_HINT.test(a[0]) ? 1 : 0;
      const bHint = REQUEST_HINT.test(b[0]) ? 1 : 0;
      if (bHint !== aHint) return bHint - aHint;
      return b[0].length - a[0].length;
    })
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

interface ValidPromptRecord {
  text: string;
  platform: string;
  model: string | null;
  timestamp: Date;
}

function toValidPromptRecord(row: {
  prompt: string | null;
  platform: string;
  model: string | null;
  timestamp: Date;
}): ValidPromptRecord | null {
  if (!row.prompt?.trim() || isNoisePrompt(row.prompt)) return null;
  const text = extractUserFacingPrompt(row.prompt) || row.prompt;
  if (!text.trim() || isNoisePrompt(text)) return null;
  return {
    text,
    platform: row.platform,
    model: row.model,
    timestamp: row.timestamp,
  };
}

async function fetchValidUserPrompts(since?: Date): Promise<ValidPromptRecord[]> {
  const db = getDatabase();
  const conditions = [eq(prompts.role, 'user')];
  if (since) conditions.push(gte(prompts.timestamp, since));

  const rows = await db
    .select({
      prompt: prompts.prompt,
      platform: prompts.platform,
      model: prompts.model,
      timestamp: prompts.timestamp,
    })
    .from(prompts)
    .where(and(...conditions));

  const result: ValidPromptRecord[] = [];
  for (const row of rows) {
    const valid = toValidPromptRecord(row);
    if (valid) result.push(valid);
  }
  return result;
}

const timelineSelectFields = {
  id: prompts.id,
  conversationId: prompts.conversationId,
  platform: prompts.platform,
  project: prompts.project,
  prompt: sql<string | null>`SUBSTR(${prompts.prompt}, 1, 240)`,
  model: prompts.model,
  timestamp: prompts.timestamp,
  score: prompts.score,
};

export async function queryTimeline(query: TimelineQuery = {}): Promise<TimelinePage> {
  const db = getDatabase();
  const pageSize = Math.min(Math.max(1, query.limit ?? 50), 200);
  const pageOffset = Math.max(0, query.offset ?? 0);
  const conditions = buildTimelineConditions(query);

  const allRows = await db
    .select({ prompt: prompts.prompt })
    .from(prompts)
    .where(and(...conditions));
  const total = allRows.filter((r) => !isNoisePrompt(r.prompt)).length;

  const items: TimelineEntry[] = [];
  let skipped = 0;
  let dbOffset = 0;
  const batchSize = Math.max(pageSize * 2, 50);

  while (items.length < pageSize) {
    const rows = await db
      .select(timelineSelectFields)
      .from(prompts)
      .where(and(...conditions))
      .orderBy(desc(prompts.timestamp))
      .limit(batchSize)
      .offset(dbOffset);

    if (rows.length === 0) break;

    for (const row of rows) {
      if (isNoisePrompt(row.prompt)) continue;
      if (skipped < pageOffset) {
        skipped++;
        continue;
      }
      items.push(mapTimelineRow(row));
      if (items.length >= pageSize) break;
    }

    dbOffset += batchSize;
    if (rows.length < batchSize) break;
  }

  return { items, total };
}

export async function getTimelineNav(): Promise<TimelineNavGroup[]> {
  const db = getDatabase();
  const rows = await db
    .select({
      platform: prompts.platform,
      project: prompts.project,
      prompt: prompts.prompt,
    })
    .from(prompts)
    .where(eq(prompts.role, 'user'));

  const platformMap = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (isNoisePrompt(row.prompt)) continue;
    const platform = row.platform;
    const project = row.project?.trim() || '未分类项目';
    if (!platformMap.has(platform)) platformMap.set(platform, new Map());
    const projMap = platformMap.get(platform)!;
    projMap.set(project, (projMap.get(project) ?? 0) + 1);
  }

  return [...platformMap.entries()]
    .map(([platform, projMap]) => {
      const projects = [...projMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      return {
        platform,
        count: projects.reduce((s, p) => s + p.count, 0),
        projects,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export async function getTimeline(limit = 100, offset = 0): Promise<TimelineEntry[]> {
  const page = await queryTimeline({ limit, offset });
  return page.items;
}

export async function getPromptCount(): Promise<number> {
  return (await fetchValidUserPrompts()).length;
}

export async function getPlatformBreakdown(): Promise<Array<{ platform: string; count: number }>> {
  const rows = await fetchValidUserPrompts();
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.platform, (map.get(row.platform) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getModelBreakdown(): Promise<Array<{ model: string; count: number }>> {
  const rows = await fetchValidUserPrompts();
  const map = new Map<string, number>();
  for (const row of rows) {
    const model = row.model?.trim();
    if (!model) continue;
    map.set(model, (map.get(model) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getStatsInRange(since: Date): Promise<{
  count: number;
  avgLength: number;
  totalTokens: number;
  totalCost: number;
}> {
  const rows = await fetchValidUserPrompts(since);
  const totalLength = rows.reduce((sum, row) => sum + row.text.length, 0);
  return {
    count: rows.length,
    avgLength: rows.length ? totalLength / rows.length : 0,
    totalTokens: 0,
    totalCost: 0,
  };
}

export async function getHeatmapData(): Promise<Array<{ hour: number; day: number; count: number }>> {
  const rows = await fetchValidUserPrompts();
  const map = new Map<string, number>();
  for (const row of rows) {
    const day = row.timestamp.getDay();
    const hour = row.timestamp.getHours();
    const key = `${day}-${hour}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => {
    const [day, hour] = key.split('-').map(Number);
    return { day, hour, count };
  });
}

export async function getWordCloudData(limit = 100): Promise<Array<{ name: string; value: number }>> {
  const rows = await fetchValidUserPrompts();
  return buildPromptPhraseCloud(
    rows.map((row) => row.text),
    limit
  );
}

function buildProjectConditions(platform: string, project: string) {
  const conditions = [eq(prompts.platform, platform), eq(prompts.role, 'user')];
  if (project === '未分类项目') {
    conditions.push(sql`(${prompts.project} IS NULL OR ${prompts.project} = '')`);
  } else {
    conditions.push(eq(prompts.project, project));
  }
  return conditions;
}

export async function getProjectProfileStats(
  platform: string,
  project: string
): Promise<ProjectProfileStats> {
  const db = getDatabase();
  const conditions = buildProjectConditions(platform, project);

  const rows = await db
    .select({
      id: prompts.id,
      conversationId: prompts.conversationId,
      prompt: prompts.prompt,
      model: prompts.model,
      projectPath: prompts.projectPath,
      timestamp: prompts.timestamp,
    })
    .from(prompts)
    .where(and(...conditions))
    .orderBy(desc(prompts.timestamp));

  const cleanRows = rows.filter((r) => r.prompt && !isNoisePrompt(r.prompt));
  const texts = cleanRows.map((r) => extractUserFacingPrompt(r.prompt!) || r.prompt!);

  const conversationIds = new Set(cleanRows.map((r) => r.conversationId));
  const modelMap = new Map<string, number>();
  const taskMap = new Map<string, number>();
  let totalLength = 0;
  let shortCount = 0;
  let chineseChars = 0;
  let totalChars = 0;

  for (const text of texts) {
    totalLength += text.length;
    if (text.length < 30) shortCount++;
    const cn = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    chineseChars += cn;
    totalChars += text.replace(/\s/g, '').length || 1;
    const task = classifyPromptTask(text);
    taskMap.set(task, (taskMap.get(task) ?? 0) + 1);
  }

  for (const row of cleanRows) {
    const model = row.model?.trim() || '未知模型';
    modelMap.set(model, (modelMap.get(model) ?? 0) + 1);
  }

  const promptCount = cleanRows.length;
  const taskTypeBreakdown: ProjectTaskTypeBreakdown[] = [...taskMap.entries()]
    .map(([type, cnt]) => ({
      type,
      label: PROMPT_TASK_LABELS[type] ?? type,
      count: cnt,
      percentage: promptCount ? Math.round((cnt / promptCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    platform,
    project,
    projectPath: cleanRows.find((r) => r.projectPath)?.projectPath ?? null,
    promptCount,
    conversationCount: conversationIds.size,
    avgPromptLength: promptCount ? Math.round(totalLength / promptCount) : 0,
    firstActivity: cleanRows.length ? cleanRows[cleanRows.length - 1]!.timestamp : null,
    lastActivity: cleanRows.length ? cleanRows[0]!.timestamp : null,
    modelBreakdown: [...modelMap.entries()]
      .map(([model, cnt]) => ({ model, count: cnt }))
      .sort((a, b) => b.count - a.count),
    taskTypeBreakdown,
    topKeywords: tokenizePromptTexts(texts, 24),
    shortPromptRatio: promptCount ? Math.round((shortCount / promptCount) * 100) : 0,
    chineseRatio: totalChars ? Math.round((chineseChars / totalChars) * 100) : 0,
  };
}

export async function getProjectPromptSamples(
  platform: string,
  project: string,
  limit = 25
): Promise<ProjectPromptSample[]> {
  const db = getDatabase();
  const conditions = buildProjectConditions(platform, project);

  const [recent, longest, shortest] = await Promise.all([
    db
      .select({ prompt: prompts.prompt, timestamp: prompts.timestamp, model: prompts.model })
      .from(prompts)
      .where(and(...conditions))
      .orderBy(desc(prompts.timestamp))
      .limit(80),
    db
      .select({ prompt: prompts.prompt, timestamp: prompts.timestamp, model: prompts.model })
      .from(prompts)
      .where(and(...conditions, sql`LENGTH(${prompts.prompt}) > 80`))
      .orderBy(desc(sql`LENGTH(${prompts.prompt})`))
      .limit(15),
    db
      .select({ prompt: prompts.prompt, timestamp: prompts.timestamp, model: prompts.model })
      .from(prompts)
      .where(and(...conditions, sql`LENGTH(${prompts.prompt}) BETWEEN 10 AND 120`))
      .orderBy(sql`LENGTH(${prompts.prompt})`)
      .limit(15),
  ]);

  const seen = new Set<string>();
  const samples: ProjectPromptSample[] = [];

  const addRow = (row: { prompt: string | null; timestamp: Date; model: string | null }) => {
    if (!row.prompt || isNoisePrompt(row.prompt)) return;
    const text = extractUserFacingPrompt(row.prompt) || row.prompt;
    const key = text.slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);
    samples.push({ prompt: text.slice(0, 600), timestamp: row.timestamp, model: row.model });
  };

  for (const row of [...recent, ...longest, ...shortest]) {
    addRow(row);
    if (samples.length >= limit) break;
  }

  return samples.slice(0, limit);
}

export async function updatePromptScore(
  id: string,
  score: number,
  notes?: string
): Promise<void> {
  const db = getDatabase();
  await db
    .update(prompts)
    .set({ score, optimizationNotes: notes ?? null, updatedAt: new Date() })
    .where(eq(prompts.id, id));
}

export async function updatePromptOptimization(
  id: string,
  optimizedVersion: string,
  notes: string,
  score?: number
): Promise<void> {
  const db = getDatabase();
  await db
    .update(prompts)
    .set({
      optimizedVersion,
      optimizationNotes: notes,
      score: score ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(prompts.id, id));
}

export async function getSetting(key: string): Promise<string | null> {
  const db = getDatabase();
  const { settings } = await import('./schema.js');
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const db = getDatabase();
  const { settings } = await import('./schema.js');
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function exportAllPrompts(limit = 5000): Promise<NormalizedPrompt[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(prompts)
    .where(eq(prompts.role, 'user'))
    .orderBy(desc(prompts.timestamp))
    .limit(limit);
  return rows.map(rowToPrompt).filter((p) => !isNoisePrompt(p.prompt));
}

export async function getTemplatePrompts(minScore: number, limit = 50): Promise<NormalizedPrompt[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.role, 'user'), gte(prompts.score, minScore)))
    .orderBy(desc(prompts.score), desc(prompts.timestamp))
    .limit(limit);
  return rows.map(rowToPrompt).filter((p) => !isNoisePrompt(p.prompt));
}
