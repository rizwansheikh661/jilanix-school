/**
 * Pure template renderer for Notification templates.
 *
 * Replaces `{{key}}` (whitespace-tolerant) tokens with values from
 * `variables`. Designed as a stateless, dependency-free helper so the
 * dispatcher (and any other caller) can compose it directly without
 * touching Nest DI.
 *
 * Rules:
 *   - subject and bodyText are emitted verbatim (no escaping).
 *   - bodyHtml replacements are HTML-entity-escaped.
 *   - Unknown variables are left in place as their literal `{{key}}` form
 *     so operators can spot them in the persisted message.
 *
 * `renderTemplateForChannel` enforces channel-specific rules on top of
 * the pure renderer: EMAIL requires a subject and is the only channel
 * that keeps HTML; everything else drops subject + HTML to null.
 */
import type { NotificationChannelValue } from '../notifications.constants';
import {
  BASE_EMAIL_LAYOUT,
  DEFAULT_EMAIL_BRANDING,
  EMAIL_CONTENT_SLOT_MARKER,
} from './email-design-system';

export interface RenderInputs {
  readonly subjectTemplate?: string | null;
  readonly bodyTextTemplate: string;
  readonly bodyHtmlTemplate?: string | null;
  readonly variables: Record<string, unknown>;
}

export interface RenderedTemplate {
  readonly subject: string | null;
  readonly bodyText: string;
  readonly bodyHtml: string | null;
}

const TOKEN_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function substitute(
  template: string,
  variables: Record<string, unknown>,
  escape: boolean,
): string {
  return template.replace(TOKEN_PATTERN, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      return match;
    }
    const raw = String(variables[key]);
    return escape ? escapeHtml(raw) : raw;
  });
}

export function renderTemplate(input: RenderInputs): RenderedTemplate {
  const subject =
    input.subjectTemplate === undefined ||
    input.subjectTemplate === null ||
    input.subjectTemplate === ''
      ? null
      : substitute(input.subjectTemplate, input.variables, false);
  const bodyText = substitute(input.bodyTextTemplate, input.variables, false);
  const bodyHtml =
    input.bodyHtmlTemplate === undefined ||
    input.bodyHtmlTemplate === null ||
    input.bodyHtmlTemplate === ''
      ? null
      : substitute(input.bodyHtmlTemplate, input.variables, true);
  return { subject, bodyText, bodyHtml };
}

export function renderTemplateForChannel(
  channel: NotificationChannelValue,
  input: RenderInputs,
): RenderedTemplate {
  if (channel === 'EMAIL') {
    const wrapped: RenderInputs = {
      ...input,
      bodyHtmlTemplate: wrapEmailBodyWithLayout(input.bodyHtmlTemplate),
      variables: { ...DEFAULT_EMAIL_BRANDING, ...input.variables },
    };
    const rendered = renderTemplate(wrapped);
    if (rendered.subject === null || rendered.subject.length === 0) {
      throw new Error('subject required for EMAIL channel');
    }
    return rendered;
  }
  const rendered = renderTemplate(input);
  return { subject: null, bodyText: rendered.bodyText, bodyHtml: null };
}

/**
 * Compose the per-template HTML fragment into the shared SchoolOS email
 * layout. Runs **before** variable substitution so that {{tokens}} inside
 * the fragment behave identically to {{tokens}} inside the layout chrome
 * (escape rules, missing-variable handling).
 *
 * Skips wrapping when:
 *   - The fragment is null/empty (caller emits a text-only EMAIL).
 *   - The fragment already begins with `<!doctype` or `<html` — treated
 *     as a self-contained document so legacy seeded templates keep
 *     working unchanged.
 */
function wrapEmailBodyWithLayout(
  fragment: string | null | undefined,
): string | null {
  if (fragment === undefined || fragment === null || fragment === '') {
    return null;
  }
  const trimmedStart = fragment.trimStart().toLowerCase();
  if (trimmedStart.startsWith('<!doctype') || trimmedStart.startsWith('<html')) {
    return fragment;
  }
  return BASE_EMAIL_LAYOUT.replace(EMAIL_CONTENT_SLOT_MARKER, fragment);
}

export function collectMissingVariables(
  template: string,
  variables: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    const key = match[1];
    if (key === undefined || seen.has(key)) continue;
    seen.add(key);
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      missing.push(key);
    }
  }
  return missing;
}
