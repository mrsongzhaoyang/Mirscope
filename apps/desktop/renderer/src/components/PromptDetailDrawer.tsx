import type { NormalizedPrompt } from '@mirscope/shared';
import PromptDiff from './PromptDiff';
import GlassCard from './ui/GlassCard';
import Icon from './ui/Icon';
import ScoreBadge from './ui/ScoreBadge';
import { gradeFromScore } from '../utils/grade';
import './PromptDetailDrawer.css';

interface PromptDetailDrawerProps {
  prompt: NormalizedPrompt;
  actionLoading: boolean;
  onClose: () => void;
  onScore: (id: string) => void;
  onRewrite: (id: string) => void;
}

export default function PromptDetailDrawer({
  prompt,
  actionLoading,
  onClose,
  onScore,
  onRewrite,
}: PromptDetailDrawerProps) {
  return (
    <div className="detail-drawer">
      <div className="detail-drawer__backdrop" onClick={onClose} />
      <GlassCard className="detail-drawer__panel">
        <div className="detail-drawer__header">
          <div>
            <span className="tag tag-cyan">{prompt.platform}</span>
            {prompt.model && <span className="tag tag-violet">{prompt.model}</span>}
          </div>
          <button type="button" className="detail-drawer__close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <ScoreBadge score={prompt.score} size="lg" />

        <div className="detail-section">
          <p className="label-upper">Prompt</p>
          <pre className="detail-code text-mono">{prompt.prompt}</pre>
        </div>

        {prompt.optimizedVersion && prompt.prompt && (
          <div className="detail-section">
            <p className="label-upper">优化对比</p>
            <PromptDiff original={prompt.prompt} revised={prompt.optimizedVersion} />
          </div>
        )}

        {prompt.optimizedVersion && (
          <div className="detail-section">
            <p className="label-upper">优化版本（全文）</p>
            <pre className="detail-code detail-code--optimized text-mono">{prompt.optimizedVersion}</pre>
          </div>
        )}

        <div className="detail-stats">
          {prompt.score != null && <span>评级: {gradeFromScore(prompt.score)}</span>}
          {prompt.language && <span>语言: {prompt.language}</span>}
          {prompt.project && <span>项目: {prompt.project}</span>}
        </div>

        <div className="detail-drawer__actions">
          <button type="button" className="btn btn-ghost" disabled={actionLoading} onClick={() => onRewrite(prompt.id)}>
            <Icon name="auto_fix_high" size={16} />
            智能优化
          </button>
          <button type="button" className="btn btn-primary" disabled={actionLoading} onClick={() => onScore(prompt.id)}>
            评分
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
