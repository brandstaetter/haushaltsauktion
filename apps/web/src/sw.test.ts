import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import { de } from './strings/de';

test('the service worker renders TASK_DUE_SOON with the in-app German wording', () => {
  const serviceWorkerSource = readFileSync('src/sw.ts', 'utf8');
  const dueSoonTemplate = serviceWorkerSource.match(/TASK_DUE_SOON:\s*'([^']+)'/)?.[1];

  expect(dueSoonTemplate).toBe(de.notifications.types.TASK_DUE_SOON);
});
