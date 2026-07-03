import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const prompts = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    platform: text('platform').notNull(),
    workspace: text('workspace'),
    project: text('project'),
    projectPath: text('project_path'),
    filePath: text('file_path'),
    provider: text('provider'),
    model: text('model'),
    role: text('role').notNull(),
    prompt: text('prompt'),
    response: text('response'),
    promptTokens: integer('prompt_tokens'),
    responseTokens: integer('response_tokens'),
    latency: integer('latency'),
    responseStatus: text('response_status'),
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
    sessionDuration: integer('session_duration'),
    language: text('language'),
    costEstimate: real('cost_estimate'),
    reuseCount: integer('reuse_count').default(0).notNull(),
    favorite: integer('favorite', { mode: 'boolean' }).default(false).notNull(),
    score: integer('score'),
    optimizedVersion: text('optimized_version'),
    optimizationNotes: text('optimization_notes'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
    hash: text('hash').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_prompts_platform').on(table.platform),
    index('idx_prompts_timestamp').on(table.timestamp),
    index('idx_prompts_conversation').on(table.conversationId),
    index('idx_prompts_model').on(table.model),
  ]
);

export const connectorSync = sqliteTable('connector_sync', {
  platform: text('platform').primaryKey(),
  lastRecordId: text('last_record_id'),
  lastSyncTime: integer('last_sync_time', { mode: 'timestamp_ms' }),
  lastHash: text('last_hash'),
  version: text('version').notNull().default('1.0'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type PromptRow = typeof prompts.$inferSelect;
export type PromptInsert = typeof prompts.$inferInsert;
export type ConnectorSyncRow = typeof connectorSync.$inferSelect;
