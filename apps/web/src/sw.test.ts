import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import { de } from './strings/de';

/**
 * The service worker cannot import `StringsContext` (there is no React tree
 * there), so `sw.ts` keeps a static duplicate of the wording. This is the
 * guard that keeps the duplicate honest: every pushed type has to read the
 * same way in a push notification as it does in the in-app bell.
 *
 * Extended from a single type to all of them when `TASK_VALUE_INCREASED`
 * became push-eligible — a per-type test would have silently not covered the
 * new one.
 */
const PUSHED_TYPES = [
  'TASK_AVAILABLE',
  'TASK_ASSIGNED',
  'TASK_DUE_SOON',
  'TASK_VALUE_INCREASED',
] as const;

const serviceWorkerSource = readFileSync('src/sw.ts', 'utf8');

test.each(PUSHED_TYPES)('the service worker renders %s with the in-app German wording', (type) => {
  const template = serviceWorkerSource.match(new RegExp(`${type}:\\s*'([^']+)'`))?.[1];

  expect(template).toBe(de.notifications.types[type]);
});

test('every template the service worker carries is one the API actually pushes', () => {
  const table = serviceWorkerSource.match(
    /const PUSH_MESSAGE_TEMPLATES[^=]*=\s*\{([\s\S]*?)\n\};/,
  )?.[1];
  expect(table).toBeDefined();

  const declared = [...table!.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  // Dead entries are not harmless: the table is the only place a reader can
  // check what a push looks like, so a stale line misdescribes the product.
  expect(declared.sort()).toEqual([...PUSHED_TYPES].sort());
});

test('the push body interpolates every scalar payload key, not just `value`', () => {
  // `{from}`/`{to}` only render because payload keys became variables
  // generically; a hand-picked `value` extraction would leave them literal.
  expect(serviceWorkerSource).toContain('function payloadVariables');
  expect(serviceWorkerSource).toMatch(/\{\s*\.\.\.payloadVariables\(data\.payload\),\s*task\s*\}/);
});
