import './PromptDiff.css';

interface DiffLine {
  type: 'same' | 'add' | 'remove';
  text: string;
}

function diffLines(original: string, revised: string): DiffLine[] {
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

interface PromptDiffProps {
  original: string;
  revised: string;
}

export default function PromptDiff({ original, revised }: PromptDiffProps) {
  const lines = diffLines(original, revised);

  return (
    <div className="prompt-diff">
      {lines.map((line, i) => (
        <div key={i} className={`prompt-diff__line prompt-diff__line--${line.type}`}>
          <span className="prompt-diff__marker">
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </span>
          <code>{line.text || ' '}</code>
        </div>
      ))}
    </div>
  );
}
