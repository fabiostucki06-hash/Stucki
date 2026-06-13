interface SpinnerProps {
  size?: number;
  color?: string;
}

export default function Spinner({ size = 32, color = 'var(--blue)' }: SpinnerProps) {
  return (
    <div style={{
      width: size,
      height: size,
      border: '3px solid var(--fill3)',
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.75s linear infinite',
    }} />
  );
}
