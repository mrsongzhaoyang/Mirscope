import { useCallback, useEffect, useState } from 'react';
import type { ProjectPlaybookResult, ProjectProfileStats } from '@mirscope/shared';
import GlassCard from './ui/GlassCard';
import Icon from './ui/Icon';
import ScoreBadge from './ui/ScoreBadge';
import './ProjectProfilePanel.css';

interface ProjectProfilePanelProps {
  platform: string;
  project: string;
  onToast?: (msg: { variant: 'success' | 'error' | 'info'; title: string; body?: string }) => void;
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function playbookSourceLabel(source: ProjectPlaybookResult['source']): string {
  if (source === 'ai') return 'AI 综合分析';
  if (source === 'fallback') return '降级分析（API 失败）';
  return '本地启发式分析';
}

function severityLabel(severity: 'high' | 'medium' | 'low'): string {
  if (severity === 'high') return '高';
  if (severity === 'medium') return '中';
  return '低';
}

export default function ProjectProfilePanel({
  platform,
  project,
  onToast,
}: ProjectProfilePanelProps) {
  const [stats, setStats] = useState<ProjectProfileStats | null>(null);
  const [playbook, setPlaybook] = useState<ProjectPlaybookResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [playbookLoading, setPlaybookLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setPlaybook(null);
    try {
      const data = await window.mirscope.analytics.projectProfile(platform, project);
      setStats(data);
    } catch (err) {
      onToast?.({ variant: 'error', title: '加载项目画像失败', body: String(err) });
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [platform, project, onToast]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const unsub = window.mirscope.onDataChanged(() => {
      void loadProfile();
    });
    return unsub;
  }, [loadProfile]);

  const handleGeneratePlaybook = async () => {
    if (!stats?.promptCount) return;
    setPlaybookLoading(true);
    try {
      const result = await window.mirscope.analytics.projectPlaybook(platform, project);
      setPlaybook(result);
      setExpanded(true);
      onToast?.({
        variant: result.source === 'ai' ? 'success' : 'info',
        title: `Playbook 已生成 · 健康度 ${result.healthScore}`,
        body: playbookSourceLabel(result.source),
      });
    } catch (err) {
      onToast?.({ variant: 'error', title: '生成 Playbook 失败', body: String(err) });
    } finally {
      setPlaybookLoading(false);
    }
  };

  if (loading) {
    return (
      <GlassCard className="project-profile project-profile--loading">
        <Icon name="hourglass_empty" size={20} />
        <span>加载项目画像...</span>
      </GlassCard>
    );
  }

  if (!stats || stats.promptCount === 0) {
    return (
      <GlassCard className="project-profile project-profile--empty">
        <Icon name="analytics" size={20} />
        <span>该项目暂无有效 Prompt，同步数据后再试</span>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="project-profile">
      <div className="project-profile__header">
        <div className="project-profile__title">
          <Icon name="insights" size={18} />
          <div>
            <h3>{project}</h3>
            <p>
              {platform} · {stats.promptCount} 条 Prompt · {stats.conversationCount} 个会话
            </p>
          </div>
        </div>
        <div className="project-profile__actions">
          {playbook && <ScoreBadge score={playbook.healthScore} size="sm" />}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={playbookLoading}
            onClick={handleGeneratePlaybook}
          >
            <Icon name="auto_awesome" size={14} />
            {playbookLoading ? '分析中...' : playbook ? '重新生成 Playbook' : '生成 Playbook'}
          </button>
          <button
            type="button"
            className="project-profile__toggle"
            aria-label={expanded ? '收起' : '展开'}
            onClick={() => setExpanded((v) => !v)}
          >
            <Icon name={expanded ? 'expand_less' : 'expand_more'} size={18} />
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="project-profile__stats">
            <div className="project-stat">
              <span className="project-stat__value">{stats.avgPromptLength}</span>
              <span className="project-stat__label">平均字数</span>
            </div>
            <div className="project-stat">
              <span className="project-stat__value">{stats.shortPromptRatio}%</span>
              <span className="project-stat__label">短 Prompt</span>
            </div>
            <div className="project-stat">
              <span className="project-stat__value">{stats.chineseRatio}%</span>
              <span className="project-stat__label">中文占比</span>
            </div>
            <div className="project-stat">
              <span className="project-stat__value project-stat__value--sm">
                {formatDate(stats.firstActivity)} — {formatDate(stats.lastActivity)}
              </span>
              <span className="project-stat__label">活跃区间</span>
            </div>
          </div>

          <div className="project-profile__grid">
            <section className="project-profile__section">
              <h4>任务类型分布</h4>
              <div className="project-task-bars">
                {stats.taskTypeBreakdown.map((task) => (
                  <div key={task.type} className="project-task-bar">
                    <div className="project-task-bar__head">
                      <span>{task.label}</span>
                      <span>{task.count} · {task.percentage}%</span>
                    </div>
                    <div className="project-task-bar__track">
                      <div
                        className="project-task-bar__fill"
                        style={{ width: `${Math.max(task.percentage, 4)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="project-profile__section">
              <h4>模型使用</h4>
              <ul className="project-model-list">
                {stats.modelBreakdown.slice(0, 5).map((m) => (
                  <li key={m.model}>
                    <span>{m.model}</span>
                    <span>{m.count}</span>
                  </li>
                ))}
              </ul>
              {stats.topKeywords.length > 0 && (
                <>
                  <h4 className="project-profile__subheading">高频词</h4>
                  <div className="project-keywords">
                    {stats.topKeywords.slice(0, 12).map((kw) => (
                      <span key={kw.name} className="tag tag-muted">
                        {kw.name}
                        <em>{kw.value}</em>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>

          {playbook && (
            <div className="project-playbook">
              <div className="project-playbook__intro">
                <p>{playbook.styleProfile}</p>
                <span className="tag tag-cyan">{playbookSourceLabel(playbook.source)}</span>
              </div>

              {(playbook.strengths.length > 0 || playbook.weaknesses.length > 0) && (
                <div className="project-playbook__cols">
                  {playbook.strengths.length > 0 && (
                    <div>
                      <h4>优势</h4>
                      <ul>
                        {playbook.strengths.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {playbook.weaknesses.length > 0 && (
                    <div>
                      <h4>待改进</h4>
                      <ul>
                        {playbook.weaknesses.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {playbook.patterns.length > 0 && (
                <div className="project-playbook__patterns">
                  <h4>反复出现的模式</h4>
                  {playbook.patterns.map((p) => (
                    <div key={p.title} className="project-pattern">
                      <div className="project-pattern__head">
                        <strong>{p.title}</strong>
                        <span className={`project-pattern__sev project-pattern__sev--${p.severity}`}>
                          {severityLabel(p.severity)}
                        </span>
                      </div>
                      <p>{p.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {playbook.suggestions.length > 0 && (
                <div>
                  <h4>改进建议</h4>
                  <ol className="project-playbook__suggestions">
                    {playbook.suggestions.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}

              {playbook.templates.length > 0 && (
                <div className="project-playbook__templates">
                  <h4>推荐 Prompt 模板</h4>
                  {playbook.templates.map((tpl) => (
                    <div key={tpl.name} className="project-template">
                      <div className="project-template__head">
                        <strong>{tpl.name}</strong>
                        <span>{tpl.scenario}</span>
                      </div>
                      <pre>{tpl.template}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
