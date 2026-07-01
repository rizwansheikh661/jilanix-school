/**
 * SchoolOS Email Design System — base layout.
 *
 * Single email-safe HTML chassis that every transactional email lands
 * inside. The dispatcher stores only the **business content fragment**
 * in `NotificationTemplateVersion.bodyHtml`; the renderer merges that
 * fragment into this layout at render time (the {{__content__}}
 * marker is replaced before normal variable substitution runs).
 *
 * Compatibility:
 *   - Table-based grid (Outlook 2007–2019 require <table>, never <div>
 *     for layout).
 *   - Inline styles only — Gmail strips most <style> blocks; the embedded
 *     <style> is restricted to a media query for mobile reflow.
 *   - System font stack (Segoe UI on Outlook/Windows, -apple-system on
 *     Apple Mail, sans-serif fallback). No web fonts.
 *   - Hex colors only (no oklch/var/css-vars in email).
 *   - Conditional `mso` blocks for VML buttons aren't used; we ship
 *     bulletproof anchor-as-button with table padding which renders
 *     consistently in Outlook 2016+ via mso fallback.
 *
 * Branding variables (all required at render time):
 *   {{schoolLogo}}        — absolute https URL to a PNG ≤ 200×60.
 *   {{schoolName}}        — plain text, ≤ 60 chars.
 *   {{emailTitle}}        — title shown in the header band.
 *   {{primaryColor}}      — hex (#RRGGBB) — used for CTA + accents.
 *   {{secondaryColor}}    — hex (#RRGGBB) — used for the header band.
 *   {{supportEmail}}      — mailto: target in footer.
 *   {{supportPhone}}      — tel: target in footer.
 *   {{applicationUrl}}    — link to the web app from the wordmark.
 *   {{currentYear}}       — copyright year.
 *   {{__content__}}       — internal slot; never user-facing.
 *
 * Optional slots (left as `{{key}}` if not provided so operators spot
 * the gap):
 *   {{previewText}}       — preheader (visible in inbox preview pane).
 */
export const BASE_EMAIL_LAYOUT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>{{emailTitle}}</title>
<style>
  @media only screen and (max-width: 600px) {
    .sos-container { width: 100% !important; max-width: 100% !important; }
    .sos-px-32 { padding-left: 20px !important; padding-right: 20px !important; }
    .sos-py-40 { padding-top: 28px !important; padding-bottom: 28px !important; }
    .sos-h1 { font-size: 22px !important; line-height: 1.3 !important; }
    .sos-h2 { font-size: 18px !important; line-height: 1.35 !important; }
    .sos-cta-link { display: block !important; }
  }
  a { text-decoration: none; }
</style>
</head>
<body style="margin:0;padding:0;background-color:#F7F8FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1A2235;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;font-size:1px;color:#F7F8FB;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{{previewText}}</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#F7F8FB;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="sos-container" style="width:600px;max-width:600px;background-color:#FFFFFF;border:1px solid #E4E7EE;border-radius:12px;box-shadow:0 4px 6px -1px rgba(15,23,42,0.08),0 2px 4px -1px rgba(15,23,42,0.04);overflow:hidden;">
        <!-- Header band -->
        <tr>
          <td style="background-color:{{secondaryColor}};padding:24px 32px;" class="sos-px-32">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td align="left" valign="middle" style="vertical-align:middle;">
                  <a href="{{applicationUrl}}" style="color:#FFFFFF;text-decoration:none;">
                    <img src="{{schoolLogo}}" alt="{{schoolName}}" height="40" style="display:block;height:40px;max-height:40px;width:auto;border:0;outline:none;text-decoration:none;">
                  </a>
                </td>
                <td align="right" valign="middle" style="vertical-align:middle;font-size:14px;color:#FFFFFF;font-weight:600;letter-spacing:0.2px;">
                  {{schoolName}}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Title strip -->
        <tr>
          <td style="background-color:#FFFFFF;padding:28px 32px 4px 32px;border-bottom:1px solid #EEF0F4;" class="sos-px-32">
            <h1 class="sos-h1" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:28px;line-height:1.25;font-weight:700;color:#1A2235;letter-spacing:-0.2px;">{{emailTitle}}</h1>
          </td>
        </tr>
        <!-- Content slot -->
        <tr>
          <td class="sos-px-32 sos-py-40" style="padding:32px;background-color:#FFFFFF;font-size:15px;line-height:1.6;color:#1A2235;">
            {{__content__}}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px 28px 32px;background-color:#F7F8FB;border-top:1px solid #EEF0F4;" class="sos-px-32">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="font-size:13px;line-height:1.6;color:#566073;padding-bottom:12px;">
                  <strong style="color:#1A2235;">Need help?</strong><br>
                  Email <a href="mailto:{{supportEmail}}" style="color:{{primaryColor}};text-decoration:none;">{{supportEmail}}</a> &nbsp;·&nbsp; Call <a href="tel:{{supportPhone}}" style="color:{{primaryColor}};text-decoration:none;">{{supportPhone}}</a>
                </td>
              </tr>
              <tr>
                <td style="font-size:12px;line-height:1.6;color:#828B9D;padding-top:12px;border-top:1px solid #E4E7EE;">
                  © {{currentYear}} {{schoolName}}. All rights reserved.<br>
                  Powered by <a href="https://jilanix.com" style="color:#566073;text-decoration:none;font-weight:600;">Jilanix ERP</a>
                  &nbsp;·&nbsp; <span style="color:#C9D2F2;">[social links]</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="sos-container" style="width:600px;max-width:600px;">
        <tr>
          <td align="center" style="padding:16px 24px;font-size:11px;line-height:1.5;color:#828B9D;">
            This is an automated message. Please do not reply directly to this email.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

/**
 * Marker that the renderer replaces with the per-template HTML
 * fragment **before** running variable substitution.
 *
 * Exposed so business templates / tests can reference the same string
 * the renderer looks for. NOT a template variable users supply — it is
 * substituted at composition time.
 */
export const EMAIL_CONTENT_SLOT_MARKER = '{{__content__}}';
