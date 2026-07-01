import type { JobHandler } from '../jobs.types';
import { JobHandlerRegistry } from './job-handler.registry';

const stub: JobHandler = async () => undefined;

describe('JobHandlerRegistry', () => {
  it('returns undefined when handler is not registered', () => {
    const reg = new JobHandlerRegistry();
    expect(reg.get('handler.unknown')).toBeUndefined();
  });

  it('register stores a handler retrievable by name', () => {
    const reg = new JobHandlerRegistry();
    reg.register('handler.send-sms', stub);
    expect(reg.get('handler.send-sms')).toBe(stub);
  });

  it('list returns registered names sorted', () => {
    const reg = new JobHandlerRegistry();
    reg.register('b.x', stub);
    reg.register('a.x', stub);
    expect(reg.list()).toEqual(['a.x', 'b.x']);
  });

  it('re-registering the same name replaces and warns', () => {
    const reg = new JobHandlerRegistry();
    const first: JobHandler = async () => 1;
    const second: JobHandler = async () => 2;
    const warn = jest.spyOn((reg as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation(() => undefined);
    reg.register('h', first);
    reg.register('h', second);
    expect(reg.get('h')).toBe(second);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
