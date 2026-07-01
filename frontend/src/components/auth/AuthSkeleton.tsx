/**
 * AuthSkeleton — loading placeholder for auth pages. Mirrors the
 * layout of an AuthCard (logo, title, subtitle, two fields, CTA) so
 * the user sees the same shape they are about to interact with.
 */
export function AuthSkeleton() {
  return (
    <div className="jlx-auth-card" aria-hidden="true">
      <div className="jlx-skeleton jlx-skeleton--brand" />
      <div className="jlx-skeleton jlx-skeleton--title" />
      <div className="jlx-skeleton jlx-skeleton--sub" />
      <div className="jlx-skeleton jlx-skeleton--field" />
      <div className="jlx-skeleton jlx-skeleton--field" />
      <div className="jlx-skeleton jlx-skeleton--cta" />
    </div>
  );
}
