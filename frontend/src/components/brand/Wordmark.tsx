import { BRAND } from '@/lib/config/app';

interface WordmarkProps {
  /** Pixel size of the mark; the wordmark scales relative to it. */
  size?: number;
  /** Optional wrapper className. */
  className?: string;
  /** Render only the mark (no text). */
  markOnly?: boolean;
}

/**
 * Wordmark — composes the brand mark with the product name from `BRAND.name`.
 * Changing `APP_CONFIG.name` updates the wordmark across the entire UI without
 * regenerating any SVG asset.
 */
export function Wordmark({ size = BRAND.markSize, className, markOnly = false }: WordmarkProps) {
  const fontSize = Math.round(size * 0.6);

  return (
    <span
      className={`d-inline-flex align-items-center gap-2 ${className ?? ''}`.trim()}
      style={{ lineHeight: 1 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND.markSrc} alt="" width={size} height={size} aria-hidden="true" />
      {markOnly ? null : (
        <span
          style={{
            fontSize,
            fontWeight: 700,
            color: '#202C4B',
            letterSpacing: '-0.01em',
          }}
        >
          {BRAND.name}
        </span>
      )}
      {markOnly ? <span className="visually-hidden">{BRAND.name}</span> : null}
    </span>
  );
}
