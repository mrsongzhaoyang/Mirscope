import type { ReactNode, CSSProperties } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  flat?: boolean;
}

export default function GlassCard({ children, className = '', style, onClick, flat }: GlassCardProps) {
  return (
    <div
      className={`glass-card ${flat ? 'glass-card--flat' : ''} ${className}`}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {children}
    </div>
  );
}
