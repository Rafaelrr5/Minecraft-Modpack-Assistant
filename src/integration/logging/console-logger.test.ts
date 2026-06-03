import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ConsoleLogger } from './console-logger.ts';
import type { LogRecord } from './console-logger.ts';

test('emits structured records at or above the configured level', () => {
  const records: LogRecord[] = [];
  const log = new ConsoleLogger({ level: 'info', sink: (r) => records.push(r), now: () => 'TS' });

  log.debug('hidden below threshold');
  log.info('shown', { a: 1 });
  log.warn('warned');

  assert.equal(records.length, 2);
  assert.deepEqual(records[0], { ts: 'TS', level: 'info', msg: 'shown', fields: { a: 1 } });
  assert.equal(records[1]?.level, 'warn');
});

test('child() merges bindings into every record', () => {
  const records: LogRecord[] = [];
  const base = new ConsoleLogger({
    level: 'debug',
    sink: (r) => records.push(r),
    now: () => 'TS',
    bindings: { svc: 'modrinth' },
  });

  base.child({ reqId: 7 }).info('hi', { extra: true });

  assert.deepEqual(records[0]?.fields, { svc: 'modrinth', reqId: 7, extra: true });
});
