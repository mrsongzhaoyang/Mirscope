import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import './HoverExpandText.css';

export interface HoverExpandTextProps {
  text: string | null | undefined;
  lines?: number;
  prefix?: string;
  className?: string;
  emptyText?: string;
}

export default function HoverExpandText({
  text,
  lines = 3,
  prefix = '💬：',
  className = '',
  emptyText = '—',
}: HoverExpandTextProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0, width: 0 });

  const content = text?.trim() ?? '';

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el || !content) {
      setTruncated(false);
      return;
    }

    const check = () => setTruncated(el.scrollHeight > el.clientHeight + 2);
    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content, lines]);

  const showPopover = () => {
    if (!truncated || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    setAnchor({ top: rect.top, left: rect.left, width: rect.width });
    setOpen(true);
  };

  if (!content) {
    return <div className={`hover-expand-text terminal-block ${className}`}>{emptyText}</div>;
  }

  return (
    <>
      <div
        className={`hover-expand-text ${truncated ? 'hover-expand-text--truncated' : ''} ${className}`}
        onMouseEnter={showPopover}
        onMouseLeave={() => setOpen(false)}
      >
        <div
          ref={previewRef}
          className="hover-expand-text__preview terminal-block"
          style={
            {
              WebkitLineClamp: lines,
              '--clamp-lines': lines,
            } as CSSProperties
          }
        >
          {prefix}
          {content.replace(/\r?\n+/g, ' ')}
        </div>
      </div>
      {open &&
        createPortal(
          <div
            className="hover-expand-text__popover terminal-block terminal-block--prewrap"
            style={{
              position: 'fixed',
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
              zIndex: 10000,
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            {prefix}
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
