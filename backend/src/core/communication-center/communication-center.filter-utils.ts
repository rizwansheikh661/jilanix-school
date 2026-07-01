/**
 * Shared mapping from the wire `CommunicationFiltersDto` (string dates,
 * `module` alias for `aggregateType`) to the internal
 * `CommunicationFilters` shape understood by the metrics repository.
 *
 * All filter consumers (dashboard, monitoring, analytics, search) share
 * this helper so the alias rules stay consistent and undefined keys are
 * omitted exactly once.
 */
import type { CommunicationFiltersDto } from './dashboard/communication-dashboard.dto';
import type { CommunicationFilters } from './communication-center-metrics.repository';

export function toFilters(dto: CommunicationFiltersDto): CommunicationFilters {
  const filters: CommunicationFilters = {};
  if (dto.from !== undefined) (filters as { from: Date }).from = new Date(dto.from);
  if (dto.to !== undefined) (filters as { to: Date }).to = new Date(dto.to);
  if (dto.channel !== undefined) (filters as { channel: typeof dto.channel }).channel = dto.channel;
  if (dto.status !== undefined) (filters as { status: typeof dto.status }).status = dto.status;
  if (dto.module !== undefined) {
    (filters as { aggregateType: string }).aggregateType = dto.module;
  }
  if (dto.recipientType !== undefined) {
    (filters as { recipientAudience: typeof dto.recipientType }).recipientAudience =
      dto.recipientType;
  }
  return filters;
}
