/**
 * Background-job permission keys (7 total). Job runs/dead-letter are
 * operator-grade; tenant users do not see them. Definitions can be
 * tenant-scoped when `schoolId` is set, but management is platform-only
 * for Sprint 5.
 */
export const JobsPermissions = {
  DEFINITION_READ: 'job.definition.read',
  DEFINITION_CREATE: 'job.definition.create',
  DEFINITION_UPDATE: 'job.definition.update',
  DEFINITION_DELETE: 'job.definition.delete',
  RUN_READ: 'job.run.read',
  DEAD_LETTER_READ: 'job.dead_letter.read',
  DEAD_LETTER_REPLAY: 'job.dead_letter.replay',
  DEAD_LETTER_DELETE: 'job.dead_letter.delete',
} as const;

export type JobsPermission = (typeof JobsPermissions)[keyof typeof JobsPermissions];

export const JOBS_PERMISSION_DESCRIPTIONS: Readonly<Record<JobsPermission, string>> = Object.freeze({
  [JobsPermissions.DEFINITION_READ]: 'List and read job definitions.',
  [JobsPermissions.DEFINITION_CREATE]: 'Create a new job definition.',
  [JobsPermissions.DEFINITION_UPDATE]: 'Update or enable/disable a job definition.',
  [JobsPermissions.DEFINITION_DELETE]: 'Delete a job definition.',
  [JobsPermissions.RUN_READ]: 'List and read job execution history.',
  [JobsPermissions.DEAD_LETTER_READ]: 'List jobs that exhausted retries.',
  [JobsPermissions.DEAD_LETTER_REPLAY]: 'Replay a dead-lettered job.',
  [JobsPermissions.DEAD_LETTER_DELETE]: 'Archive a dead-lettered job (no replay).',
});

export const JOB_STATUS = Object.freeze({
  QUEUED: 'queued',
  CLAIMED: 'claimed',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DEAD: 'dead',
} as const);

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

/** Worker identity used in `Job.claimedBy`. Unique per process. */
export const WORKER_ID_PREFIX = 'api';
