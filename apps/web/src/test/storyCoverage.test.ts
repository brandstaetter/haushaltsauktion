/**
 * Story coverage inventory.
 *
 * Fails when a route-level page, a page-local section, or a shared component
 * has no colocated `*.stories.tsx`. This is the machine-checkable half of the
 * "complete Storybook coverage" contract — without it, coverage silently rots
 * the moment someone adds a component, since `build-storybook` only builds the
 * stories that exist and has no opinion about the ones that don't.
 *
 * Scope is deliberately `src/components/` and `src/pages/` only: those are the
 * two trees whose contents are visual by construction. Everything else in
 * `src/` (api clients, hooks, context, mocks, the service worker) is non-visual
 * and has nothing to render in isolation.
 *
 * A module inside those two trees that genuinely has no visual output belongs
 * in `EXCLUSIONS` below **with a written reason** — the exclusion list is the
 * documented escape hatch the acceptance criteria call for, not a silent skip.
 * Stale entries are an error too: a path listed here that no longer exists
 * fails the test, so the list can't drift out of sync with the source tree.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Trees whose `.tsx` files are visual by construction and therefore need stories. */
const COVERED_TREES = ['components', 'pages'] as const;

/**
 * Modules under the covered trees that render nothing on their own, mapped to
 * why. Keep the reason specific enough that a reviewer can disagree with it.
 */
const EXCLUSIONS: Record<string, string> = {};

/** `Foo.tsx` needs `Foo.stories.tsx`; `Foo.test.tsx` and `Foo.stories.tsx` are not themselves subjects. */
function isStorySubject(fileName: string): boolean {
  return (
    fileName.endsWith('.tsx') &&
    !fileName.endsWith('.test.tsx') &&
    !fileName.endsWith('.stories.tsx')
  );
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) return walk(absolute);
    return isStorySubject(entry) ? [absolute] : [];
  });
}

/** POSIX-style path relative to `src/`, so expectations read the same on Windows and CI. */
function relativeToSrc(absolute: string): string {
  return path.relative(srcDir, absolute).split(path.sep).join('/');
}

function hasColocatedStory(absolute: string): boolean {
  const storyPath = absolute.replace(/\.tsx$/, '.stories.tsx');
  try {
    return statSync(storyPath).isFile();
  } catch {
    return false;
  }
}

const subjects = COVERED_TREES.flatMap((tree) => walk(path.join(srcDir, tree)));

describe('Storybook coverage', () => {
  it('finds story subjects to check', () => {
    // Guards against the walk silently returning nothing (a moved directory,
    // a broken path join) and the suite then "passing" vacuously.
    expect(subjects.length).toBeGreaterThan(0);
  });

  it('every page and component has a colocated story', () => {
    const missing = subjects
      .map(relativeToSrc)
      .filter((relative) => !(relative in EXCLUSIONS))
      .filter((relative) => !hasColocatedStory(path.join(srcDir, relative)))
      .sort();

    expect(missing).toEqual([]);
  });

  it('has no stale exclusions', () => {
    const stale = Object.keys(EXCLUSIONS)
      .filter((relative) => !subjects.map(relativeToSrc).includes(relative))
      .sort();

    expect(stale).toEqual([]);
  });
});
