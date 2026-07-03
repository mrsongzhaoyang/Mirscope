import { gradeFromScore } from '../../utils/grade';
import './ScoreBadge.css';

interface ScoreBadgeProps {
  score?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

export default function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  if (score == null) {
    return (
      <div className={`score-badge score-badge--${size} score-badge--empty`}>
        <span>—</span>
      </div>
    );
  }

  const grade = gradeFromScore(score);
  const pct = score / 100;
  const circumference = 2 * Math.PI * 18;
  const offset = circumference * (1 - pct);
  const color =
    score >= 85 ? 'var(--secondary)' : score >= 70 ? 'var(--primary)' : 'var(--warning)';

  return (
    <div className={`score-badge score-badge--${size}`}>
      <svg className="score-badge__ring" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity={0.2}
        />
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 20 20)"
        />
      </svg>
      <span className="score-badge__grade" style={{ color }}>
        {grade}
      </span>
      <span className="score-badge__score">{score}/100</span>
    </div>
  );
}
