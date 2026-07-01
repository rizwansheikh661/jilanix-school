'use client';

import Image from 'next/image';
import { ShieldCheck, Users, Cloud, Headphones } from 'lucide-react';

/**
 * BrandingPanel — left ~40% column of the Jilanix auth surface.
 *
 * Matches the LOCKED approved mockup: top-centered logo + JILANIX
 * wordmark + gold-flanked "OPERATOR CONSOLE" tag, headline with the
 * word "Futures." rendered in gold, supporting paragraph, and a
 * horizontal 4-column feature strip. School-building illustration
 * fills the panel and stays visible through the top-heavy gradient.
 *
 * Entrance choreography: title reveals word-by-word, then the lede
 * fades in, then the feature strip cascades. All wrapped in a
 * `prefers-reduced-motion: reduce` override in the stylesheet.
 */
interface FeatureItem {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly sub: string;
}

const FEATURES: FeatureItem[] = [
  { icon: <ShieldCheck size={24} aria-hidden="true" />, title: 'Enterprise Security', sub: '256-bit encryption and industry best practices' },
  { icon: <Users size={24} aria-hidden="true" />, title: 'Role Based Access', sub: 'Granular permissions for every team' },
  { icon: <Cloud size={24} aria-hidden="true" />, title: 'Always Available', sub: '99.9% uptime with reliable infrastructure' },
  { icon: <Headphones size={24} aria-hidden="true" />, title: '24/7 Support', sub: 'Get help whenever you need us' },
];

// Split lines so each word can animate independently while the full
// sentence remains readable to assistive tech via the parent heading.
const TITLE_LINES: readonly (readonly { text: string; accent?: boolean }[])[] = [
  [{ text: 'Powering' }, { text: 'Schools.' }],
  [{ text: 'Enriching' }, { text: 'Futures.', accent: true }],
];

export function BrandingPanel() {
  let wordIndex = 0;

  return (
    <aside className="jlx-auth-shell__brand" aria-hidden="false">
      <div className="jlx-auth-shell__brand-inner">
        <div className="jlx-brand-hero-mark">
          <Image
            src="/assets/branding/logo-light.png"
            width={170}
            height={130}
            alt=""
            priority
          />
          <span className="jlx-brand-hero-mark__title">Jilanix</span>
          <span className="jlx-brand-hero-mark__tag">Operator Console</span>
        </div>

        <div className="jlx-brand-hero">
          <h1 className="jlx-brand-hero__title">
            {TITLE_LINES.map((line, lineIdx) => (
              <span key={lineIdx} className="jlx-brand-hero__title-line">
                {line.map((word) => {
                  const delay = `${wordIndex++ * 110}ms`;
                  const Tag = word.accent ? 'em' : 'span';
                  return (
                    <Tag
                      key={`${lineIdx}-${word.text}`}
                      className="jlx-brand-hero__title-word"
                      style={{ animationDelay: delay }}
                    >
                      {word.text}
                    </Tag>
                  );
                })}
              </span>
            ))}
          </h1>
          <p className="jlx-brand-hero__lede">
            Jilanix Operator Console helps you manage hundreds of schools,
            subscriptions, and platform operations seamlessly.
          </p>
        </div>

        <ul className="jlx-brand-features">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="jlx-brand-feature">
              <span className="jlx-brand-feature__icon">{feature.icon}</span>
              <span className="jlx-brand-feature__title">{feature.title}</span>
              <span className="jlx-brand-feature__sub">{feature.sub}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
