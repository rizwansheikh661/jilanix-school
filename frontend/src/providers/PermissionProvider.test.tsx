import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ permissions: mockPermissions, featureFlags: mockFlags }),
}));

let mockPermissions = new Set<string>();
let mockFlags = new Map<string, boolean>();

import { PermissionProvider, usePermission } from '@/providers/PermissionProvider';
import { FeatureFlagProvider, useFeatureFlags } from '@/providers/FeatureFlagProvider';

function PermissionProbe({ check }: { check: (p: ReturnType<typeof usePermission>) => boolean }) {
  return <span data-testid="r">{check(usePermission()) ? 'YES' : 'NO'}</span>;
}

function FlagProbe({ flagKey }: { flagKey: string }) {
  const ff = useFeatureFlags();
  return <span data-testid="r">{ff.isEnabled(flagKey) ? 'ON' : 'OFF'}</span>;
}

describe('PermissionProvider', () => {
  it('grants only matching permissions', () => {
    mockPermissions = new Set(['students.read']);
    render(
      <PermissionProvider>
        <PermissionProbe check={(p) => p.has('students.read') && !p.has('students.write')} />
      </PermissionProvider>,
    );
    expect(screen.getByTestId('r')).toHaveTextContent('YES');
  });

  it('wildcard * grants everything', () => {
    mockPermissions = new Set(['*']);
    render(
      <PermissionProvider>
        <PermissionProbe check={(p) => p.hasAll(['x.y', 'z.w'])} />
      </PermissionProvider>,
    );
    expect(screen.getByTestId('r')).toHaveTextContent('YES');
  });

  it('hasAll requires every permission', () => {
    mockPermissions = new Set(['a']);
    render(
      <PermissionProvider>
        <PermissionProbe check={(p) => p.hasAll(['a', 'b'])} />
      </PermissionProvider>,
    );
    expect(screen.getByTestId('r')).toHaveTextContent('NO');
  });
});

describe('FeatureFlagProvider', () => {
  it('reports enabled flag as on', () => {
    mockFlags = new Map([['cmdk', true]]);
    render(
      <FeatureFlagProvider>
        <FlagProbe flagKey="cmdk" />
      </FeatureFlagProvider>,
    );
    expect(screen.getByTestId('r')).toHaveTextContent('ON');
  });

  it('missing flag reports off', () => {
    mockFlags = new Map([]);
    render(
      <FeatureFlagProvider>
        <FlagProbe flagKey="missing" />
      </FeatureFlagProvider>,
    );
    expect(screen.getByTestId('r')).toHaveTextContent('OFF');
  });
});
