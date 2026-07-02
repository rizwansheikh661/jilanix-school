'use client';

import Image from 'next/image';
import { ShieldCheck, Users, GraduationCap, BookOpen } from 'lucide-react';

/**
 * BrandingPanel — left 50% column with dark purple overlay on school image.
 * Features the Jilanix brand, headline, and feature highlights.
 */

interface FeatureItem {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly desc: string;
}

const FEATURES: FeatureItem[] = [
  { icon: <Users size={20} aria-hidden="true" />, title: '2,500+', desc: 'Active Students' },
  { icon: <GraduationCap size={20} aria-hidden="true" />, title: '200+', desc: 'Expert Teachers' },
  { icon: <BookOpen size={20} aria-hidden="true" />, title: '50+', desc: 'Courses' },
  { icon: <ShieldCheck size={20} aria-hidden="true" />, title: '99.9%', desc: 'Uptime' },
];

export function BrandingPanel() {
  return (
    <aside className="jlx-auth-shell__brand" aria-hidden="false">
      {/* School background image */}
      <div className="jlx-auth-brand__bg" />
      <div className="jlx-auth-brand__overlay" />

      <div className="jlx-auth-shell__brand-inner">
        {/* Logo */}
        <div className="jlx-brand-hero-mark">
          <Image
            src="/assets/branding/logo-light.png"
            width={48}
            height={48}
            alt=""
            priority
          />
          <span className="jlx-brand-hero-mark__title">Jilanix</span>
        </div>

        {/* Main content */}
        <div className="jlx-brand-hero">
          <h1 className="jlx-brand-hero__title">
            Powering Schools.{'\n'}
            Enriching <em>Futures.</em>
          </h1>
          <p className="jlx-brand-hero__lede">
            Complete school management platform for modern educational
            institutions — manage admissions, attendance, exams, and more.
          </p>
        </div>

        {/* Feature cards */}
        <div className="jlx-brand-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="jlx-brand-feature">
              <span className="jlx-brand-feature__icon">{f.icon}</span>
              <div className="jlx-brand-feature__text">
                <span className="jlx-brand-feature__value">{f.title}</span>
                <span className="jlx-brand-feature__desc">{f.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom tagline */}
        <div className="jlx-brand-tagline">
          <p className="jlx-brand-tagline__text">
            &ldquo;Education is the most powerful weapon which you can use to change the world.&rdquo;
          </p>
          <span className="jlx-brand-tagline__author">— Nelson Mandela</span>
        </div>
      </div>
    </aside>
  );
}
