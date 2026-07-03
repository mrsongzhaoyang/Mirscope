import { useEffect, useState } from 'react';
import Icon from './ui/Icon';
import './WindowControls.css';

export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const isDarwin = window.mirscope?.platform === 'darwin';

  useEffect(() => {
    if (isDarwin) return;
    window.mirscope.window.isMaximized().then(setMaximized);
  }, [isDarwin]);

  if (isDarwin) return null;

  const handleMaximize = async () => {
    const next = await window.mirscope.window.maximize();
    setMaximized(next);
  };

  return (
    <div className="window-controls app-region-no-drag">
      <button type="button" className="window-controls__btn" onClick={() => window.mirscope.window.minimize()} aria-label="最小化">
        <Icon name="remove" size={14} />
      </button>
      <button type="button" className="window-controls__btn" onClick={handleMaximize} aria-label={maximized ? '还原' : '最大化'}>
        <Icon name={maximized ? 'filter_none' : 'crop_square'} size={14} />
      </button>
      <button type="button" className="window-controls__btn window-controls__btn--close" onClick={() => window.mirscope.window.close()} aria-label="关闭">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
