import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  NormalizedPrompt,
  PromptRewriteResult,
  PromptScoreResult,
  TimelineEntry,
  TimelineNavGroup,
} from '@mirscope/shared';
import PromptDetailDrawer from '../components/PromptDetailDrawer';
import ProjectProfilePanel from '../components/ProjectProfilePanel';
import { useUIStore } from '../stores/ui-store';
import ConversationPreview from '../components/ui/ConversationPreview';
import GlassCard from '../components/ui/GlassCard';
import Icon from '../components/ui/Icon';
import ScoreBadge from '../components/ui/ScoreBadge';
import Toast, { type ToastMessage } from '../components/ui/Toast';
import './Timeline.css';

const PAGE_SIZES = [20, 50, 100] as const;

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function platformIcon(platform: string): string {
  if (platform.includes('cursor')) return 'terminal';
  if (platform.includes('trae')) return 'code';
  if (platform.includes('codebuddy') || platform.includes('workbuddy')) return 'smart_toy';
  if (platform.includes('claude')) return 'bolt';
  if (platform.includes('chatgpt')) return 'smart_toy';
  return 'chat';
}

function sourceLabel(source?: string): string {
  if (source === 'ai') return 'AI 评分';
  if (source === 'fallback') return '降级评分（API 失败）';
  return '本地启发式评分';
}

function promptToEntry(p: NormalizedPrompt): TimelineEntry {
  return {
    id: p.id,
    conversationId: p.conversationId,
    platform: p.platform,
    project: p.project,
    prompt: p.prompt,
    model: p.model,
    timestamp: p.timestamp,
    score: p.score,
  };
}

export default function Timeline() {
  const searchFocusTick = useUIStore((s) => s.searchFocusTick);

  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [navGroups, setNavGroups] = useState<TimelineNavGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [navPlatform, setNavPlatform] = useState<string | undefined>();
  const [navProject, setNavProject] = useState<string | undefined>();
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());

  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TimelineEntry[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState<NormalizedPrompt | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const isSearchMode = query.trim().length > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadNav = useCallback(async () => {
    const nav = await window.mirscope.analytics.timelineNav();
    setNavGroups(nav);
  }, []);

  const loadPage = useCallback(async () => {
    if (isSearchMode) return;
    setLoading(true);
    try {
      const result = await window.mirscope.analytics.timelineQuery({
        platform: navPlatform,
        project: navProject,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setEntries(result.items);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [isSearchMode, navPlatform, navProject, dateFrom, dateTo, pageSize, page]);

  useEffect(() => {
    void loadNav();
  }, [loadNav]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const unsub = window.mirscope.onDataChanged(() => {
      void loadNav();
      void loadPage();
    });
    return unsub;
  }, [loadNav, loadPage]);

  useEffect(() => {
    if (searchFocusTick > 0) {
      searchRef.current?.focus();
      searchRef.current?.select();
    }
  }, [searchFocusTick]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await window.mirscope.prompts.search({ query: q, limit: 50 });
        setSearchResults(results.map(promptToEntry));
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [navPlatform, navProject, dateFrom, dateTo, pageSize]);

  const displayEntries = isSearchMode ? (searchResults ?? []) : entries;

  const navLabel = useMemo(() => {
    if (navProject) return `${navPlatform} / ${navProject}`;
    if (navPlatform) return navPlatform;
    return '全部对话';
  }, [navPlatform, navProject]);

  const selectAll = () => {
    setNavPlatform(undefined);
    setNavProject(undefined);
  };

  const selectPlatform = (platform: string) => {
    setNavPlatform(platform);
    setNavProject(undefined);
    setExpandedPlatforms((prev) => new Set(prev).add(platform));
  };

  const selectProject = (platform: string, project: string) => {
    setNavPlatform(platform);
    setNavProject(project);
  };

  const togglePlatform = (platform: string) => {
    setExpandedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const showScoreResult = (result: PromptScoreResult) => {
    setToast({
      id: Date.now(),
      variant: result.source === 'ai' ? 'success' : 'info',
      title: `评分 ${result.score} (${result.grade}) · ${sourceLabel(result.source)}`,
      body: [...result.deductions, ...result.suggestions].filter(Boolean).join('\n') || undefined,
    });
  };

  const showRewriteResult = (result: PromptRewriteResult) => {
    setToast({
      id: Date.now(),
      variant: result.source === 'ai' ? 'success' : 'info',
      title: result.source === 'ai' ? '优化完成' : sourceLabel(result.source),
      body: result.reasons.join('\n'),
    });
  };

  const refreshEntry = useCallback(
    async (id: string) => {
      const updated = await window.mirscope.prompts.get(id);
      if (!updated) return null;
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? promptToEntry(updated) : e)),
      );
      setSelected((prev) => (prev?.id === id ? updated : prev));
      if (searchResults) {
        setSearchResults((prev) =>
          prev ? prev.map((e) => (e.id === id ? promptToEntry(updated) : e)) : prev,
        );
      }
      return updated;
    },
    [searchResults],
  );

  const handleScore = async (id: string) => {
    setActionLoadingId(id);
    try {
      const result = await window.mirscope.prompts.score(id);
      showScoreResult(result);
      await refreshEntry(id);
    } catch (err) {
      setToast({ id: Date.now(), variant: 'error', title: '评分失败', body: String(err) });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRewrite = async (id: string) => {
    setActionLoadingId(id);
    try {
      const result = await window.mirscope.prompts.rewrite(id);
      showRewriteResult(result);
      await refreshEntry(id);
    } catch (err) {
      setToast({ id: Date.now(), variant: 'error', title: '优化失败', body: String(err) });
    } finally {
      setActionLoadingId(null);
    }
  };

  const openDetail = async (id: string) => {
    const detail = await window.mirscope.prompts.get(id);
    if (detail) setSelected(detail);
  };

  return (
    <div className="page-content timeline-page page-content--compact">
      <div className="timeline-layout">
        <aside className="timeline-sidebar">
          <GlassCard className="timeline-nav-panel">
            <div className="timeline-nav-panel__header">
              <Icon name="folder_open" size={16} />
              <h3>对话分类</h3>
            </div>

            <button
              type="button"
              className={`timeline-nav-item ${!navPlatform ? 'timeline-nav-item--active' : ''}`}
              onClick={selectAll}
            >
              <Icon name="forum" size={16} />
              <span>全部对话</span>
              <span className="timeline-nav-item__count">
                {navGroups.reduce((s, g) => s + g.count, 0)}
              </span>
            </button>

            {navGroups.map((group) => {
              const expanded = expandedPlatforms.has(group.platform);
              const platformActive = navPlatform === group.platform && !navProject;
              return (
                <div key={group.platform} className="timeline-nav-group">
                  <div className="timeline-nav-group__row">
                    <button
                      type="button"
                      className="timeline-nav-group__toggle"
                      onClick={() => togglePlatform(group.platform)}
                      aria-label={expanded ? '收起' : '展开'}
                    >
                      <Icon name={expanded ? 'expand_more' : 'chevron_right'} size={16} />
                    </button>
                    <button
                      type="button"
                      className={`timeline-nav-item timeline-nav-item--platform ${platformActive ? 'timeline-nav-item--active' : ''}`}
                      onClick={() => selectPlatform(group.platform)}
                    >
                      <Icon name={platformIcon(group.platform)} size={16} />
                      <span>{group.platform}</span>
                      <span className="timeline-nav-item__count">{group.count}</span>
                    </button>
                  </div>
                  {expanded &&
                    group.projects.map((proj) => (
                      <button
                        key={`${group.platform}-${proj.name}`}
                        type="button"
                        className={`timeline-nav-item timeline-nav-item--project ${navPlatform === group.platform && navProject === proj.name ? 'timeline-nav-item--active' : ''}`}
                        onClick={() => selectProject(group.platform, proj.name)}
                      >
                        <span>{proj.name}</span>
                        <span className="timeline-nav-item__count">{proj.count}</span>
                      </button>
                    ))}
                </div>
              );
            })}
          </GlassCard>
        </aside>

        <div className="timeline-main">
          <div className="timeline-header">
            <div>
              <h2 className="page-title">
                {navProject && !isSearchMode ? '项目 Prompt 画像' : '对话交互历史'}
              </h2>
              <p className="page-subtitle">
                {isSearchMode
                  ? searching
                    ? '搜索中...'
                    : `搜索到 ${displayEntries.length} 条`
                  : navProject
                    ? `${navPlatform} / ${navProject} · 共 ${total.toLocaleString()} 条对话`
                    : `共 ${total.toLocaleString()} 条 · 当前 ${navLabel}`}
              </p>
            </div>
          </div>

          {navProject && navPlatform && !isSearchMode && (
            <ProjectProfilePanel
              key={`${navPlatform}:${navProject}`}
              platform={navPlatform}
              project={navProject}
              onToast={(msg) => setToast({ id: Date.now(), ...msg })}
            />
          )}

          <div className="timeline-toolbar">
            <div className="timeline-search">
              <Icon name="search" />
              <input
                ref={searchRef}
                type="text"
                placeholder="搜索对话、模型或标签..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="timeline-search__clear"
                  aria-label="清除搜索"
                  onClick={() => setQuery('')}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>

            {!isSearchMode && (
              <div className="timeline-filters">
                <label className="timeline-filter">
                  <span>起始</span>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </label>
                <label className="timeline-filter">
                  <span>截止</span>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </label>
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                  >
                    清除日期
                  </button>
                )}
              </div>
            )}
          </div>

          {loading && !isSearchMode ? (
            <div className="empty-state">
              <div className="empty-state__icon">
                <Icon name="hourglass_empty" size={28} />
              </div>
              <h3>加载中...</h3>
            </div>
          ) : displayEntries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">
                <Icon name="timeline" size={28} />
              </div>
              <h3>{isSearchMode ? '未找到匹配对话' : '暂无对话记录'}</h3>
              <p>
                {isSearchMode
                  ? '换个关键词试试'
                  : '点击左侧「同步数据」，从 Cursor 导入 AI 对话历史'}
              </p>
            </div>
          ) : (
            <>
              <div className="timeline-track">
                <div className="timeline-track__line" />
                {displayEntries.map((entry, index) => (
                  <TimelineItem
                    key={entry.id}
                    entry={entry}
                    active={index === 0 && !isSearchMode && page === 1}
                    onOpenDetail={() => openDetail(entry.id)}
                  />
                ))}
              </div>

              {!isSearchMode && (
                <div className="timeline-pagination">
                  <div className="timeline-pagination__size">
                    <span>每页</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n} 条
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="timeline-pagination__nav">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      上一页
                    </button>
                    <span className="timeline-pagination__info">
                      第 {page} / {totalPages} 页
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selected && (
        <PromptDetailDrawer
          prompt={selected}
          actionLoading={actionLoadingId === selected.id}
          onClose={() => setSelected(null)}
          onScore={handleScore}
          onRewrite={handleRewrite}
        />
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

const TimelineItem = memo(function TimelineItem({
  entry,
  active,
  onOpenDetail,
}: {
  entry: TimelineEntry;
  active: boolean;
  onOpenDetail: () => void;
}) {
  return (
    <div className="timeline-item">
      <div className={`timeline-node ${active ? 'timeline-node--active' : ''}`}>
        <Icon name={platformIcon(entry.platform)} size={14} filled={active} />
      </div>

      <GlassCard className="timeline-card">
        <div className="timeline-card__header">
          <div className="timeline-card__meta">
            <div>
              <div className="timeline-card__title-row">
                <span className="timeline-card__platform">{entry.platform}</span>
                {entry.model && <span className="tag tag-cyan">{entry.model}</span>}
              </div>
              <p className="timeline-card__time">{formatTime(entry.timestamp)}</p>
            </div>
          </div>
          <ScoreBadge score={entry.score} size="sm" />
        </div>

        <button type="button" className="timeline-card__body" onClick={onOpenDetail}>
          <ConversationPreview prompt={entry.prompt} />
        </button>

        <div className="timeline-card__footer">
          {entry.project ? <span className="tag tag-muted">{entry.project}</span> : <span />}
          <span className="timeline-card__hint">点击查看详情</span>
        </div>
      </GlassCard>
    </div>
  );
});
