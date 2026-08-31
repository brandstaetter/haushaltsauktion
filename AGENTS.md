# Hausarbietsbörse

Hausarbietsbörse codebase guidance for Citadel-powered agents.

## Citadel Project Guidance

This file is the Codex-facing projection of the canonical Citadel project spec. Codex reads AGENTS.md files from the repository root down to the current working directory, so nested AGENTS.override.md files can add narrower rules when a package needs them.

## Conventions

- Describe the project's architectural rules.
- Describe coding standards and review expectations.
- Describe any directory or ownership boundaries that matter.

## Workflows

- Describe the expected build, test, and verification flow.
- Describe how agents should stage, verify, and present work.
- Describe any handoff or campaign expectations.

## Constraints

- Describe protected files or directories.
- Describe sandbox, security, or approval constraints.
- Describe platform-specific or deployment constraints.

## Verification

- Use the narrowest command that proves the changed behavior.
- Run `node scripts/test-all.js` after modifying hooks, skills, runtime adapters, or shared architecture code.
- Run targeted tests first when the change is scoped to one script, hook, or generator.

## Review Guidelines

- Lead with correctness, security, regression risk, and missing verification.
- Treat stale generated Codex artifacts as actionable when they would mislead future agents.
- Keep findings concrete with file and line references when reviewing code.

## Codex Notes

- Use `$skill-name` when an installed Citadel skill matches the task.
- Use native Codex subagents, worktrees, MCP servers, and automations when they reduce coordination overhead without bypassing Citadel state.
- Keep durable campaign, fleet, research, and verification state under `.planning/` when a workflow spans sessions.

## Handoff Summary

When a task completes, prefer a concise handoff that states:

- What changed
- Key decisions
- Remaining risks or next steps
