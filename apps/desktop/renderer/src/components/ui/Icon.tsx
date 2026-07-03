interface IconProps {
  name: string;
  filled?: boolean;
  className?: string;
  size?: number;
}

export default function Icon({ name, filled, className = '', size }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`}
      style={size ? { fontSize: size } : undefined}
    >
      {name}
    </span>
  );
}
