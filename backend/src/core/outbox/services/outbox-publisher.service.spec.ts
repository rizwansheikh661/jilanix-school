import { PublishRequiresTransactionError } from '../outbox.errors';
import { OutboxPublisherService } from './outbox-publisher.service';

describe('OutboxPublisherService', () => {
  it('throws when called without a transaction client', async () => {
    const repo = { create: jest.fn() };
    const svc = new OutboxPublisherService(repo as never);

    await expect(
      svc.publish(undefined, {
        topic: 'feature_flag.changed',
        eventType: 'feature_flag.definition.changed',
        aggregateType: 'FeatureFlag',
        aggregateId: 'flag-1',
        payload: { foo: 'bar' },
      }),
    ).rejects.toBeInstanceOf(PublishRequiresTransactionError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('persists with a generated ULID event id when none provided', async () => {
    const repo = { create: jest.fn().mockResolvedValue({ id: 'x' }) };
    const svc = new OutboxPublisherService(repo as never);
    const tx = {} as never;

    await svc.publish(tx, {
      topic: 't',
      eventType: 'e',
      aggregateType: 'A',
      aggregateId: 'a-1',
      payload: { x: 1 },
    });
    expect(repo.create).toHaveBeenCalledTimes(1);
    const [args, passedTx] = repo.create.mock.calls[0] as [
      { id: string; eventId: string; topic: string; schoolId: string | null },
      unknown,
    ];
    expect(passedTx).toBe(tx);
    expect(args.id).toHaveLength(26);
    expect(args.eventId).toHaveLength(26);
    expect(args.topic).toBe('t');
    expect(args.schoolId).toBeNull();
  });

  it('honours an explicit eventId override', async () => {
    const repo = { create: jest.fn().mockResolvedValue({ id: 'x' }) };
    const svc = new OutboxPublisherService(repo as never);
    await svc.publish({} as never, {
      topic: 't',
      eventType: 'e',
      aggregateType: 'A',
      aggregateId: 'a',
      payload: {},
      eventId: 'event-explicit',
    });
    expect(repo.create.mock.calls[0][0]).toMatchObject({ eventId: 'event-explicit' });
  });
});
