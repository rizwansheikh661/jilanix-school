/**
 * password-reset.events — Sprint 17 W4.
 *
 * Stable outbox-topic constants emitted by `PasswordResetService`. Currently
 * a thin re-export of the keys defined in `provisioning.constants.ts`; the
 * dedicated file gives downstream subscribers (e.g. ParentActivationOutboxHandler)
 * a single, narrow import target that does not pull in plan/permissions/etc.
 *
 * The generic `PASSWORD_FIRST_LOGIN_COMPLETED` topic is published by
 * `PasswordResetService.confirm()` (when consuming a token left a
 * `mustChangePassword=true` flag flipped to false) and by
 * `PasswordResetService.firstLoginChange()` (authenticated rotation path).
 * Both emissions share the same `{ userId, schoolId, completedAt }` payload
 * shape — see the handler subscribers for the contract.
 */
import { ProvisioningOutboxTopics } from '../provisioning.constants';

export const PasswordResetEvents = {
  PASSWORD_RESET_REQUESTED: ProvisioningOutboxTopics.PASSWORD_RESET_REQUESTED,
  PASSWORD_FIRST_LOGIN_COMPLETED:
    ProvisioningOutboxTopics.PASSWORD_FIRST_LOGIN_COMPLETED,
} as const;

export type PasswordResetEvent =
  (typeof PasswordResetEvents)[keyof typeof PasswordResetEvents];

/**
 * Payload shape published on `PASSWORD_FIRST_LOGIN_COMPLETED`. Downstream
 * subscribers (parent / staff activation handlers) destructure these
 * fields directly.
 */
export interface PasswordFirstLoginCompletedPayload {
  readonly schoolId: string;
  readonly userId: string;
  readonly completedAt: string;
}
