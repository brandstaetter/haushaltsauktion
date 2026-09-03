/**
 * Architektur §7.4 — the import matrix and the purity rules are a **build
 * failure**, not a convention.
 *
 * Three things are enforced here that a reviewer would otherwise have to hold
 * in their head on every pull request:
 *
 *  1. `domain/` cannot import Prisma, Fastify, `app/` or `infra/`, and cannot
 *     read the clock or draw randomness. That purity is what makes the value
 *     chain, the fairness weights and the state machine testable with plain
 *     unit tests and no fixtures — and what lets §34's simulation run 1000
 *     cycles without a database.
 *  2. `app/` cannot import `infra/`. Everything a use-case needs arrives in
 *     `Deps`, which is what lets an integration test call `executeBuyout`
 *     directly with no server running.
 *  3. `packages/shared` cannot import from `apps/`. The web app sees `shared`
 *     and nothing else, so it cannot import a domain function and start
 *     computing a binding value client-side — which §36 forbids.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

import haushalt from './eslint-rules/index.js';

/**
 * §7.2's purity rule, stated precisely.
 *
 * The architecture writes this as `no-restricted-globals` on `Date`, but taken
 * literally that also forbids `new Date(instant + 60_000)` — pure arithmetic on
 * a timestamp the caller injected, which is exactly what a deterministic
 * recurrence calculation is made of. What actually breaks purity is *reading
 * ambient time*: `Date.now()` and a zero-argument `new Date()`. Those two are
 * what is banned, so the rule catches every real violation and no correct code.
 */
const NO_AMBIENT_TIME_OR_RANDOMNESS = [
  'error',
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'domain/ ist rein: die Zeit kommt über Clock.now() (§7.2).',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'domain/ ist rein: die Zeit kommt über Clock.now() (§7.2).',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'domain/ ist rein: Zufall kommt über Rng (§6.8, §7.2).',
  },
];

export default tseslint.config(
  {
    // Only this project's own TypeScript is linted. Tooling scripts elsewhere
    // in the repo have their own conventions and are not part of §7.4.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.prisma/**',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
      '.citadel/**',
      '.planning/**',
      'apps/web/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts'],
    plugins: { import: importPlugin, haushalt },
    rules: {
      // §7.3's import matrix, zone by zone.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './apps/api/src/domain', from: './apps/api/src/app' },
            { target: './apps/api/src/domain', from: './apps/api/src/infra' },
            { target: './apps/api/src/app', from: './apps/api/src/infra' },
            { target: './apps/api/src/simulation', from: './apps/api/src/app' },
            { target: './apps/api/src/simulation', from: './apps/api/src/infra' },
            { target: './packages/shared/src', from: './apps' },
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ── the pure core ────────────────────────────────────────────────────
  {
    files: ['apps/api/src/domain/**/*.ts', 'packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': NO_AMBIENT_TIME_OR_RANDOMNESS,
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'domain/ ist rein: keine Umgebungszugriffe (§7.2).' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@prisma/client', message: 'domain/ kennt keine Persistenz (§7.3).' },
            { name: 'fastify', message: 'domain/ kennt kein HTTP (§7.3).' },
            { name: 'node:crypto', message: 'domain/ ist rein: Zufall kommt über Rng (§7.2).' },
          ],
          patterns: ['**/app/**', '**/infra/**'],
        },
      ],
    },
  },

  // ── use-cases: the lock ladder ───────────────────────────────────────
  {
    files: ['apps/api/src/app/**/*.ts'],
    rules: {
      // §4.2. Deadlock freedom is a static property here, so it is checked
      // statically rather than discovered in production at 3 a.m.
      'haushalt/lock-order': 'error',
      'haushalt/household-scope': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: ['**/infra/**'],
          paths: [{ name: 'fastify', message: 'app/ kennt kein HTTP (§7.3).' }],
        },
      ],
    },
  },

  // ── infra: household scoping still applies ───────────────────────────
  {
    files: ['apps/api/src/infra/**/*.ts'],
    rules: { 'haushalt/household-scope': 'error' },
  },

  // ── operator metrics: the one deliberate, audited cross-household query
  // surface ──────────────────────────────────────────────────────────────
  {
    // Architektur `.planning/architecture-operator-dashboard.md` §4: platform-
    // wide metrics (total households, total users, ...) are inherently
    // cross-household — there is no householdId to filter by. Deliberately
    // isolated to this one file (not scattered `eslint-disable` comments
    // across the module) so the entire exception to CLAUDE.md §36 stays in
    // one auditable place. Every query here is guarded instead by
    // `requireOperator` (apps/api/src/infra/http/operatorContext.ts), a
    // structurally separate identity that a household `Session` can never
    // hold — proven by `apps/api/test/integration/operator-isolation.test.ts`.
    files: ['apps/api/src/app/operator/metrics.ts'],
    rules: { 'haushalt/household-scope': 'off' },
  },

  // ── tests and the seed ───────────────────────────────────────────────
  {
    // The seed *creates* the household it would otherwise have to scope to, so
    // its upserts key on fixed ids by design (they are what make it idempotent).
    files: ['apps/api/test/**/*.ts', 'apps/api/prisma/seed.ts', '**/*.test.ts'],
    rules: {
      'haushalt/household-scope': 'off',
      'haushalt/lock-order': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
