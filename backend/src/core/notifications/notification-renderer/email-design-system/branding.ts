/**
 * SchoolOS Email Design System — design tokens + reusable HTML components.
 *
 * These are the colour, type, and component constants the base layout
 * uses. Mirrored from `frontend/src/styles/_tokens.scss` so a single
 * change there can be reflected here without grep guesswork.
 *
 * The base layout itself uses these as hard-coded hex values (email
 * clients reject CSS variables); this module re-exports them so business
 * content fragments can compose buttons / alerts / cards using the same
 * palette without redefining values.
 */

export const EMAIL_DESIGN_TOKENS = {
  // Brand — used by header band, links, primary CTA fill.
  brandPrimary: '#2D4FCC',
  brandPrimaryHover: '#243FA8',
  brandPrimarySubtle: '#EEF1FC',

  // Accent — used by secondary highlights.
  accentSecondary: '#0E9F8E',

  // Semantic — alert boxes.
  success: '#15803D',
  successSubtle: '#E8F5EC',
  warning: '#B45309',
  warningSubtle: '#FEF3E6',
  danger: '#B42318',
  dangerSubtle: '#FEE8E5',
  info: '#1E5FBE',
  infoSubtle: '#E7F0FB',

  // Surface + text.
  bgApp: '#F7F8FB',
  surfaceCard: '#FFFFFF',
  textPrimary: '#1A2235',
  textSecondary: '#566073',
  textMuted: '#828B9D',
  textInverse: '#FFFFFF',

  // Borders.
  borderDefault: '#E4E7EE',
  borderSubtle: '#EEF0F4',

  // Radius — limited to values email clients render reliably.
  radiusSm: '4px',
  radiusMd: '8px',
  radiusLg: '12px',
} as const;

/**
 * Default branding variables, applied by the renderer when the caller
 * does not provide one. Lets a first-time tenant receive a sensible
 * email before the school has uploaded its own logo or set support
 * details.
 */
export const DEFAULT_EMAIL_BRANDING: Readonly<Record<string, string>> = {
  schoolLogo:
    'https://jilanix-public.s3.ap-south-1.amazonaws.com/schoolos/email-default-logo.png',
  schoolName: 'SchoolOS',
  primaryColor: EMAIL_DESIGN_TOKENS.brandPrimary,
  secondaryColor: '#1A2235',
  supportEmail: 'support@jilanix.com',
  supportPhone: '+91-00000-00000',
  applicationUrl: 'https://app.jilanix.com',
  previewText: '',
};

/**
 * Bulletproof anchor-as-button. Renders as a solid-fill pill across
 * Gmail / Outlook / Apple Mail / Yahoo / mobile clients. Use this from
 * business content fragments instead of inventing per-template buttons.
 */
export function emailPrimaryButton(args: {
  readonly href: string;
  readonly label: string;
  readonly color?: string;
}): string {
  const fill = args.color ?? '{{primaryColor}}';
  return [
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">',
    '<tr>',
    `<td align="center" bgcolor="${fill}" style="border-radius:8px;background-color:${fill};">`,
    `<a href="${args.href}" class="sos-cta-link" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:8px;">${args.label}</a>`,
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

/**
 * Information / warning / danger / success card. Same chrome, palette
 * swapped by the `tone` argument. The fragment is HTML — its inner
 * `{{tokens}}` are substituted by the renderer in the same pass as the
 * surrounding template.
 */
export function emailAlertBox(args: {
  readonly tone: 'info' | 'warning' | 'danger' | 'success';
  readonly title?: string;
  readonly bodyHtml: string;
}): string {
  const palette = {
    info: { bg: EMAIL_DESIGN_TOKENS.infoSubtle, fg: EMAIL_DESIGN_TOKENS.info, border: '#A8C5EE' },
    warning: { bg: EMAIL_DESIGN_TOKENS.warningSubtle, fg: EMAIL_DESIGN_TOKENS.warning, border: '#F0C18B' },
    danger: { bg: EMAIL_DESIGN_TOKENS.dangerSubtle, fg: EMAIL_DESIGN_TOKENS.danger, border: '#F49B91' },
    success: { bg: EMAIL_DESIGN_TOKENS.successSubtle, fg: EMAIL_DESIGN_TOKENS.success, border: '#86CFA0' },
  }[args.tone];
  const titleHtml =
    args.title === undefined
      ? ''
      : `<div style="font-weight:600;color:${palette.fg};font-size:14px;margin-bottom:6px;">${args.title}</div>`;
  return [
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0;">`,
    '<tr>',
    `<td style="padding:14px 16px;background-color:${palette.bg};border:1px solid ${palette.border};border-left:4px solid ${palette.fg};border-radius:8px;font-size:13px;line-height:1.55;color:#1A2235;">`,
    titleHtml,
    args.bodyHtml,
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

/**
 * Generic information card — neutral surface, used for fallback URLs,
 * order summaries, label-value pairs, etc.
 */
export function emailInfoCard(args: { readonly bodyHtml: string }): string {
  return [
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0;">',
    '<tr>',
    `<td style="padding:16px;background-color:${EMAIL_DESIGN_TOKENS.bgApp};border:1px solid ${EMAIL_DESIGN_TOKENS.borderDefault};border-radius:8px;font-size:13px;line-height:1.55;color:${EMAIL_DESIGN_TOKENS.textPrimary};">`,
    args.bodyHtml,
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

/** Secondary / muted paragraph for explanatory body copy under titles. */
export function emailSecondaryText(text: string): string {
  return `<p style="margin:0 0 16px 0;color:${EMAIL_DESIGN_TOKENS.textSecondary};font-size:14px;line-height:1.6;">${text}</p>`;
}
