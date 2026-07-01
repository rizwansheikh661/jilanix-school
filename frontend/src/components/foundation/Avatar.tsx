import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { initialsOf, avatarPaletteIndex } from '@/lib/utils/initials';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away';

export interface AvatarProps {
  name: string;
  src?: string | null;
  alt?: string;
  size?: AvatarSize;
  square?: boolean;
  status?: AvatarStatus;
  className?: string;
}

const PALETTE = [
  '#E11D48', '#F97316', '#EAB308', '#22C55E',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
];

export function Avatar({ name, src, alt, size = 'md', square, status, className }: AvatarProps): ReactNode {
  const initials = initialsOf(name);
  const bg = PALETTE[avatarPaletteIndex(name)];
  const labelText = alt ?? name;

  return (
    <span
      className={cn('so-avatar', `so-avatar--${size}`, square && 'so-avatar--square', className)}
      style={src ? undefined : { backgroundColor: bg, color: '#FFFFFF' }}
      aria-label={labelText}
      title={labelText}
      role="img"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={labelText} />
      ) : (
        initials
      )}
      {status ? (
        <span className={cn('so-avatar__status-dot', `so-avatar__status-dot--${status}`)} aria-hidden="true" />
      ) : null}
    </span>
  );
}
