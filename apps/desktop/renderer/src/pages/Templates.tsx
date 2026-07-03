import { useEffect, useState } from 'react';
import type { NormalizedPrompt } from '@mirscope/shared';
import GlassCard from '../components/ui/GlassCard';
import HoverExpandText from '../components/ui/HoverExpandText';
import Icon from '../components/ui/Icon';
import ScoreBadge from '../components/ui/ScoreBadge';
import './Templates.css';

export default function Templates() {
  const [templates, setTemplates] = useState<NormalizedPrompt[]>([]);
  const [minScore, setMinScore] = useState(85);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async (score = minScore) => {
    setLoading(true);
    try {
      const items = await window.mirscope.prompts.templates(score, 40);
      setTemplates(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    window.mirscope.settings.get().then((s) => {
      setMinScore(s.preferences.templateMinScore);
      void load(s.preferences.templateMinScore);
    });
  }, []);

  const copyPrompt = async (p: NormalizedPrompt) => {
    if (!p.prompt) return;
    await navigator.clipboard.writeText(p.prompt);
    setCopiedId(p.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="page-content templates-page page-content--compact">
      <div className="templates-header">
        <div>
          <h2 className="page-title">Prompt 模板库</h2>
          <p className="page-subtitle">高分 Prompt 可复用模板 · 评分 ≥ {minScore}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => load()}>
          <Icon name="refresh" size={16} />
          刷新
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <h3>加载中...</h3>
        </div>
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Icon name="library_books" size={28} />
          </div>
          <h3>暂无模板</h3>
          <p>在对话时间线中对 Prompt 评分后，高分条目会自动出现在这里</p>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map((p) => (
            <GlassCard key={p.id} className="template-card">
              <div className="template-card__top">
                <ScoreBadge score={p.score} size="sm" />
                <div className="template-card__tags">
                  {p.model && <span className="tag tag-cyan">{p.model}</span>}
                  {p.language && <span className="tag tag-muted">{p.language}</span>}
                </div>
              </div>
              <HoverExpandText text={p.prompt} lines={4} className="template-card__body" />
              <div className="template-card__footer">
                <span className="template-card__meta">{p.platform}</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => copyPrompt(p)}>
                  <Icon name={copiedId === p.id ? 'check' : 'content_copy'} size={14} />
                  {copiedId === p.id ? '已复制' : '复制'}
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
