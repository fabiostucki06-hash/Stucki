import { SC } from '../../constants/statuses';
import type { OrderStatus } from '../../types';

interface BadgeProps {
  status: OrderStatus;
  small?: boolean;
}

export default function Badge({ status, small }: BadgeProps) {
  return (
    <span
      className={`badge status-${status}`}
      style={{ fontSize: small ? 11 : 13, padding: small ? '2px 8px' : '3px 10px' }}
    >
      {small ? SC[status]?.short : SC[status]?.label}
    </span>
  );
}
