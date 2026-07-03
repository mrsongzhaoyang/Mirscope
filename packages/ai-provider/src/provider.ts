import type {
  AIProviderConfig,
  ProjectPlaybookResult,
  ProjectProfileStats,
  ProjectPromptSample,
  PromptRewriteResult,
  PromptScoreResult,
} from '@mirscope/shared';
import { gradeFromScore } from '@mirscope/shared';

const SCORE_SYSTEM_PROMPT = `你是一位专业的 Prompt 工程评估专家。请对用户的 Prompt 进行评分。
评分维度（每项 0-100）：
1. 目标明确度 (clarity)
2. 上下文完整度 (context)
3. 输出格式规范性 (format)
4. 角色设定完整性 (role)
5. 约束条件完备性 (constraints)
6. 可执行落地性 (executability)

请以 JSON 格式返回：
{
  "score": 总分(0-100),
  "dimensions": { "clarity": N, "context": N, "format": N, "role": N, "constraints": N, "executability": N },
  "deductions": ["扣分原因1", "扣分原因2"],
  "suggestions": ["优化建议1", "优化建议2"]
}`;

const REWRITE_SYSTEM_PROMPT = `你是一位专业的 Prompt 优化专家。请优化用户的 Prompt，使其更清晰、更具体、更可执行。
请以 JSON 格式返回：
{
  "optimizedPrompt": "优化后的 Prompt",
  "reasons": ["修改原因1", "修改原因2"]
}`;

const PROJECT_PLAYBOOK_PROMPT = `你是一位 Prompt 工程顾问。根据用户在一个软件项目中的 AI 对话样本和统计数据，生成项目级 Prompt 画像与改进 Playbook。

注意：
- 关注「项目整体协作模式」，不要逐条点评样本
- 识别反复出现的低效写法（如上下文缺失、指令模糊、缺少验收标准）
- 建议必须可执行，模板必须可直接复制使用
- 用中文输出

请以 JSON 格式返回：
{
  "healthScore": 0-100,
  "styleProfile": "2-3句项目 Prompt 风格画像",
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["问题1", "问题2"],
  "patterns": [{ "title": "模式名", "description": "描述", "severity": "high|medium|low" }],
  "suggestions": ["可执行建议1", "建议2", "建议3"],
  "templates": [{ "name": "模板名", "scenario": "适用场景", "template": "可直接复制的 Prompt 模板" }]
}`;

export class AIProvider {
  constructor(private config: AIProviderConfig) {}

  async scorePrompt(prompt: string): Promise<PromptScoreResult> {
    if (!this.config.apiKey) {
      return { ...this.localHeuristicScore(prompt), source: 'local' };
    }

    try {
      const response = await this.callModel(SCORE_SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(response) as Omit<PromptScoreResult, 'grade' | 'source'>;
      return {
        ...parsed,
        grade: gradeFromScore(parsed.score),
        source: 'ai',
      };
    } catch {
      return { ...this.localHeuristicScore(prompt), source: 'fallback' };
    }
  }

  async rewritePrompt(prompt: string): Promise<PromptRewriteResult> {
    if (!this.config.apiKey) {
      return {
        optimizedPrompt: prompt,
        source: 'local',
        reasons: ['未配置 API Key，无法进行 AI 优化。请在设置中配置模型 API Key。'],
      };
    }

    try {
      const response = await this.callModel(REWRITE_SYSTEM_PROMPT, prompt);
      return { ...(JSON.parse(response) as PromptRewriteResult), source: 'ai' };
    } catch {
      return {
        optimizedPrompt: prompt,
        source: 'fallback',
        reasons: ['AI 优化请求失败，请检查 API Key 和网络连接。'],
      };
    }
  }

  async generateProjectPlaybook(
    stats: ProjectProfileStats,
    samples: ProjectPromptSample[]
  ): Promise<ProjectPlaybookResult> {
    if (!this.config.apiKey) {
      return this.localProjectPlaybook(stats, samples);
    }

    const payload = {
      project: stats.project,
      platform: stats.platform,
      stats: {
        promptCount: stats.promptCount,
        conversationCount: stats.conversationCount,
        avgPromptLength: stats.avgPromptLength,
        shortPromptRatio: stats.shortPromptRatio,
        chineseRatio: stats.chineseRatio,
        modelBreakdown: stats.modelBreakdown,
        taskTypeBreakdown: stats.taskTypeBreakdown,
        topKeywords: stats.topKeywords.slice(0, 12),
      },
      samples: samples.map((s, i) => ({
        index: i + 1,
        model: s.model,
        timestamp: s.timestamp,
        prompt: s.prompt.slice(0, 400),
      })),
    };

    try {
      const response = await this.callModel(
        PROJECT_PLAYBOOK_PROMPT,
        JSON.stringify(payload, null, 2)
      );
      const parsed = JSON.parse(response) as Omit<ProjectPlaybookResult, 'grade' | 'source' | 'sampleCount'>;
      const healthScore = Math.min(100, Math.max(0, Number(parsed.healthScore) || 70));
      return {
        ...parsed,
        healthScore,
        grade: gradeFromScore(healthScore),
        source: 'ai',
        sampleCount: samples.length,
      };
    } catch {
      return { ...this.localProjectPlaybook(stats, samples), source: 'fallback' };
    }
  }

  private localProjectPlaybook(
    stats: ProjectProfileStats,
    samples: ProjectPromptSample[]
  ): ProjectPlaybookResult {
    let healthScore = 72;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const patterns: ProjectPlaybookResult['patterns'] = [];
    const suggestions: string[] = [];

    if (stats.avgPromptLength >= 80) {
      healthScore += 6;
      strengths.push('Prompt 平均长度适中，通常包含足够上下文');
    } else if (stats.avgPromptLength < 40) {
      healthScore -= 12;
      weaknesses.push('Prompt 普遍偏短，容易缺少必要上下文');
      patterns.push({
        title: '短指令依赖',
        description: `约 ${stats.shortPromptRatio}% 的 Prompt 少于 30 字，AI 可能需要多轮追问`,
        severity: 'high',
      });
      suggestions.push('复杂任务先用 2-3 句说明背景、目标和约束，再给出具体指令');
    }

    if (stats.chineseRatio >= 60) {
      strengths.push('以中文协作为主，表达自然');
    }

    const topTask = stats.taskTypeBreakdown[0];
    if (topTask && topTask.percentage >= 50) {
      patterns.push({
        title: `任务高度集中于「${topTask.label}」`,
        description: `占全部 Prompt 的 ${topTask.percentage}%，可考虑为该类任务建立固定模板`,
        severity: 'medium',
      });
    }

    if (stats.modelBreakdown.length > 2) {
      suggestions.push('同一项目建议固定 1-2 个主力模型，减少风格漂移');
    }

    if (stats.promptCount >= 20 && stats.conversationCount > 0) {
      const ratio = stats.promptCount / stats.conversationCount;
      if (ratio > 8) {
        healthScore -= 8;
        patterns.push({
          title: '单会话轮次偏多',
          description: `平均每会话约 ${ratio.toFixed(1)} 条 Prompt，可能存在反复纠偏`,
          severity: 'medium',
        });
        suggestions.push('首次 Prompt 中明确验收标准（文件路径、预期行为、不要改什么）');
      }
    }

    if (suggestions.length === 0) {
      suggestions.push('为高频任务（Bug 修复、新功能、重构）各准备一份项目 Prompt 模板');
      suggestions.push('每次提问附上相关文件路径和报错信息');
    }

    if (strengths.length === 0) {
      strengths.push('已积累足够的项目对话样本，适合提炼协作模式');
    }

    healthScore = Math.min(100, Math.max(30, healthScore));

    const templates: ProjectPlaybookResult['templates'] = [
      {
        name: 'Bug 修复模板',
        scenario: '定位并修复项目中的报错或异常行为',
        template:
          '项目：{项目名}\n问题：{现象描述}\n复现步骤：{步骤}\n相关文件：{路径}\n报错信息：{日志/截图文字}\n期望：{修复后行为}\n约束：不要改动 {范围}',
      },
      {
        name: '功能开发模板',
        scenario: '在现有代码库中实现新功能',
        template:
          '背景：{为什么需要这个功能}\n目标：{具体要实现什么}\n相关模块：{文件/目录}\n验收标准：{怎样算完成}\n风格：遵循项目现有代码风格，改动范围尽量小',
      },
    ];

    const styleProfile =
      stats.promptCount < 5
        ? '样本较少，暂无法形成稳定风格画像，建议继续积累对话后再分析。'
        : `本项目共 ${stats.promptCount} 条有效 Prompt、${stats.conversationCount} 个会话，平均长度 ${stats.avgPromptLength} 字，主要任务类型为「${topTask?.label ?? '其他'}」。`;

    return {
      healthScore,
      grade: gradeFromScore(healthScore),
      source: 'local',
      styleProfile,
      strengths,
      weaknesses,
      patterns,
      suggestions,
      templates,
      sampleCount: samples.length,
    };
  }

  private localHeuristicScore(prompt: string): PromptScoreResult {
    let score = 50;
    const deductions: string[] = [];
    const suggestions: string[] = [];

    if (prompt.length < 20) {
      score -= 15;
      deductions.push('Prompt 过短，缺乏必要细节');
      suggestions.push('补充更多上下文和具体要求');
    } else if (prompt.length > 50) {
      score += 8;
    }
    if (prompt.length > 150) score += 5;
    if (prompt.length > 400) score += 3;

    if (/请|帮我|实现|创建|分析|编写|优化|解释/.test(prompt)) score += 6;
    else suggestions.push('建议使用明确的动作词（请、帮我、实现等）');

    if (/格式|输出|返回|JSON|markdown|表格/.test(prompt)) score += 6;
    else suggestions.push('可补充期望的输出格式');

    if (/角色|你是|作为|扮演/.test(prompt)) score += 5;
    if (/限制|不要|必须|确保|禁止|仅/.test(prompt)) score += 5;
    if (/\d+\.|[-*]\s|步骤|首先|然后|最后/.test(prompt)) score += 8;
    if (/```|示例|example|样例|比如/.test(prompt)) score += 8;
    if (prompt.split('\n').filter(Boolean).length >= 4) score += 5;
    if (/背景|上下文|场景|目标/.test(prompt)) score += 5;

    if (prompt.length > 800 && !/步骤|首先|[-*]\s/.test(prompt)) {
      score -= 5;
      deductions.push('长 Prompt 缺少结构化分段');
      suggestions.push('长文本建议使用列表或步骤拆分');
    }

    score = Math.min(100, Math.max(0, score));

    return {
      score,
      grade: gradeFromScore(score),
      source: 'local' as const,
      dimensions: {
        clarity: score,
        context: score - 5,
        format: score - 10,
        role: score - 15,
        constraints: score - 10,
        executability: score,
      },
      deductions,
      suggestions,
    };
  }

  private async callModel(systemPrompt: string, userPrompt: string): Promise<string> {
    const provider = this.config.provider.toLowerCase();
    const model = this.config.model ?? 'gpt-4o-mini';

    if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter') {
      const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? '{}';
    }

    if (provider === 'anthropic') {
      const baseUrl = this.config.baseUrl ?? 'https://api.anthropic.com/v1';
      const res = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-sonnet-20241022',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      return data.content?.[0]?.text ?? '{}';
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }
}

export function createAIProvider(config: AIProviderConfig): AIProvider {
  return new AIProvider(config);
}
