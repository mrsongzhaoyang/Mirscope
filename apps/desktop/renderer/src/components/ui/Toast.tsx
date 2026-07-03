import { useEffect } from 'react';
import './Toast.css';

export interface ToastMessage {
  id: number;
  title: string;
  body?: string;
  variant?: 'info' | 'success' | 'error';
}

interface ToastProps {
  message: ToastMessage | null;
  onClose: () => void;
  durationMs?: number;
}

export default function Toast({ message, onClose, durationMs = 5000 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [message, onClose, durationMs]);

  if (!message) return null;

  return (
    <div className={`toast toast--${message.variant ?? 'info'}`} role="status">
      <div className="toast__content">
        <p className="toast__title">{message.title}</p>
        {message.body && <pre className="toast__body">{message.body}</pre>}
      </div>
      <button type="button" className="toast__close" onClick={onClose} aria-label="关闭">
        ×
      </button>
    </div>
  );
}
