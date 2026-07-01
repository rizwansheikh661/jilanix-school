/**
 * Unit spec for the lifecycle transition matrix. The matrix is the single
 * source of truth for valid TRIAL/ACTIVE/SUSPENDED/EXPIRED/CANCELLED edges,
 * so we lock its shape down here.
 */
import {
  InvalidLifecycleTransitionError,
} from '../provisioning.errors';
import {
  LIFECYCLE_TRANSITIONS,
  assertLifecycleTransition,
  isLifecycleTransitionAllowed,
} from './lifecycle-transitions';

describe('lifecycle-transitions', () => {
  it('allows TRIAL → ACTIVE / EXPIRED / CANCELLED only', () => {
    expect(isLifecycleTransitionAllowed('TRIAL', 'ACTIVE')).toBe(true);
    expect(isLifecycleTransitionAllowed('TRIAL', 'EXPIRED')).toBe(true);
    expect(isLifecycleTransitionAllowed('TRIAL', 'CANCELLED')).toBe(true);
    expect(isLifecycleTransitionAllowed('TRIAL', 'SUSPENDED')).toBe(false);
    expect(isLifecycleTransitionAllowed('TRIAL', 'TRIAL')).toBe(false);
  });

  it('allows ACTIVE → SUSPENDED / CANCELLED only', () => {
    expect(isLifecycleTransitionAllowed('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(isLifecycleTransitionAllowed('ACTIVE', 'CANCELLED')).toBe(true);
    expect(isLifecycleTransitionAllowed('ACTIVE', 'TRIAL')).toBe(false);
    expect(isLifecycleTransitionAllowed('ACTIVE', 'EXPIRED')).toBe(false);
    expect(isLifecycleTransitionAllowed('ACTIVE', 'ACTIVE')).toBe(false);
  });

  it('allows SUSPENDED → ACTIVE / CANCELLED only', () => {
    expect(isLifecycleTransitionAllowed('SUSPENDED', 'ACTIVE')).toBe(true);
    expect(isLifecycleTransitionAllowed('SUSPENDED', 'CANCELLED')).toBe(true);
    expect(isLifecycleTransitionAllowed('SUSPENDED', 'TRIAL')).toBe(false);
    expect(isLifecycleTransitionAllowed('SUSPENDED', 'EXPIRED')).toBe(false);
  });

  it('allows EXPIRED → ACTIVE / CANCELLED only', () => {
    expect(isLifecycleTransitionAllowed('EXPIRED', 'ACTIVE')).toBe(true);
    expect(isLifecycleTransitionAllowed('EXPIRED', 'CANCELLED')).toBe(true);
    expect(isLifecycleTransitionAllowed('EXPIRED', 'SUSPENDED')).toBe(false);
  });

  it('treats CANCELLED as terminal (no outgoing edges)', () => {
    expect(LIFECYCLE_TRANSITIONS.CANCELLED).toEqual([]);
    expect(isLifecycleTransitionAllowed('CANCELLED', 'ACTIVE')).toBe(false);
    expect(isLifecycleTransitionAllowed('CANCELLED', 'SUSPENDED')).toBe(false);
    expect(isLifecycleTransitionAllowed('CANCELLED', 'TRIAL')).toBe(false);
  });

  it('assertLifecycleTransition throws InvalidLifecycleTransitionError on a forbidden edge', () => {
    expect(() => {
      assertLifecycleTransition('ACTIVE', 'TRIAL');
    }).toThrow(InvalidLifecycleTransitionError);
  });

  it('assertLifecycleTransition is a no-op on a legal edge', () => {
    expect(() => {
      assertLifecycleTransition('TRIAL', 'ACTIVE');
    }).not.toThrow();
  });
});
