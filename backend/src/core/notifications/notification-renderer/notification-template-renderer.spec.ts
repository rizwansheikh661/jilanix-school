/**
 * Pure-function specs for the notification template renderer.
 * No mocks — the renderer is a stateless helper.
 */
import {
  collectMissingVariables,
  renderTemplate,
  renderTemplateForChannel,
} from './notification-template-renderer';

describe('renderTemplate', () => {
  it('substitutes simple {{key}} tokens in subject + bodyText + bodyHtml', () => {
    const out = renderTemplate({
      subjectTemplate: 'Hi {{name}}',
      bodyTextTemplate: 'Hello {{name}}',
      bodyHtmlTemplate: '<p>Hello {{name}}</p>',
      variables: { name: 'Ada' },
    });
    expect(out.subject).toBe('Hi Ada');
    expect(out.bodyText).toBe('Hello Ada');
    expect(out.bodyHtml).toBe('<p>Hello Ada</p>');
  });

  it('tolerates whitespace inside the token delimiters {{  key  }}', () => {
    const out = renderTemplate({
      bodyTextTemplate: 'Hello {{  name  }}',
      variables: { name: 'Ada' },
    });
    expect(out.bodyText).toBe('Hello Ada');
  });

  it('preserves the literal {{missing}} when the variable is absent', () => {
    const out = renderTemplate({
      bodyTextTemplate: 'Hello {{missing}}',
      variables: {},
    });
    expect(out.bodyText).toBe('Hello {{missing}}');
  });

  it('HTML-escapes substitutions in bodyHtml (< -> &lt;, etc.)', () => {
    const out = renderTemplate({
      bodyHtmlTemplate: '<p>{{value}}</p>',
      bodyTextTemplate: 'noop',
      variables: { value: `<script>alert("x")</script>` },
    });
    expect(out.bodyHtml).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>',
    );
  });

  it('does NOT HTML-escape substitutions in subject or bodyText', () => {
    const out = renderTemplate({
      subjectTemplate: 'Re: {{value}}',
      bodyTextTemplate: 'You sent: {{value}}',
      variables: { value: '<b>raw</b>' },
    });
    expect(out.subject).toBe('Re: <b>raw</b>');
    expect(out.bodyText).toBe('You sent: <b>raw</b>');
  });
});

describe('renderTemplateForChannel', () => {
  it('EMAIL throws when subject is missing or empty', () => {
    expect(() =>
      renderTemplateForChannel('EMAIL', {
        subjectTemplate: null,
        bodyTextTemplate: 'body',
        bodyHtmlTemplate: '<p>body</p>',
        variables: {},
      }),
    ).toThrow(/subject required/i);

    expect(() =>
      renderTemplateForChannel('EMAIL', {
        subjectTemplate: '',
        bodyTextTemplate: 'body',
        bodyHtmlTemplate: '<p>body</p>',
        variables: {},
      }),
    ).toThrow(/subject required/i);
  });

  it('SMS returns subject=null and bodyHtml=null even if both are provided', () => {
    const out = renderTemplateForChannel('SMS', {
      subjectTemplate: 'Subj {{x}}',
      bodyTextTemplate: 'Body {{x}}',
      bodyHtmlTemplate: '<p>HTML {{x}}</p>',
      variables: { x: '1' },
    });
    expect(out.subject).toBeNull();
    expect(out.bodyHtml).toBeNull();
    expect(out.bodyText).toBe('Body 1');
  });

  it('IN_APP returns subject=null and bodyHtml=null even if both are provided', () => {
    const out = renderTemplateForChannel('IN_APP', {
      subjectTemplate: 'Subj',
      bodyTextTemplate: 'Body',
      bodyHtmlTemplate: '<p>HTML</p>',
      variables: {},
    });
    expect(out.subject).toBeNull();
    expect(out.bodyHtml).toBeNull();
    expect(out.bodyText).toBe('Body');
  });
});

describe('collectMissingVariables', () => {
  it('returns the unique list of missing keys in source order', () => {
    const missing = collectMissingVariables(
      'Hi {{name}}, your code {{code}} expires {{date}}. Repeat {{name}} {{code}}.',
      { code: 'X1' },
    );
    expect(missing).toEqual(['name', 'date']);
  });

  it('returns an empty list when all variables are supplied', () => {
    const missing = collectMissingVariables('Hi {{name}}', { name: 'Ada' });
    expect(missing).toEqual([]);
  });
});
