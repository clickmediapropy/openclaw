# Repository Guidelines

## Project Structure & Module Organization

OpenClaw is a TypeScript monorepo in this folder.

- Core runtime: `src/`
- Channel extensions: `extensions/`
- Desktop/mobile apps: `apps/` (`apps/macos`, `apps/ios`, `apps/android`)
- Control UI: `ui/`
- Shared packages: `packages/`
- Documentation: `docs/`
- Automation and build assets: `scripts/`, `assets/`, `test/`

## Build, Test, and Development Commands

- `pnpm install` — install dependencies (Node 22+).
- `pnpm build` — production build (`dist/`) plus plugin SDK type generation and export prep.
- `pnpm dev` — run gateway/node dev loop.
- `pnpm openclaw ...` — run CLI in TS via `tsx`.
- `pnpm check` — typecheck + lint + format checks.
- `pnpm test` — run standard test suite.
- `pnpm test:coverage` — run Vitest with coverage output.
- `pnpm test:e2e` — run end-to-end tests.
- `pnpm --dir ui test` and `pnpm ui:build` — UI unit tests / UI build.
- `pnpm gateway:watch` — watch-mode gateway + auto-reload.

## Coding Style & Naming Conventions

- Language: TypeScript (ESM), strict typing preferred.
- Formatting/lint: `oxfmt` + `oxlint` via `pnpm check`.
- Use existing naming patterns: domain-first paths under `src/...`, camelCase for variables/functions, PascalCase for classes/types.
- Keep plugin dependency boundaries local: extension-specific dependencies should live in each extension `package.json`.
- Prefer readable small helpers over nested conditionals; avoid “magic” `any` usage in new code.

## Testing Guidelines

- Framework: Vitest (`vitest.config.ts`), with Node and Bun lanes.
- Coverage thresholds (repo config): `lines 70`, `functions 70`, `branches 55`, `statements 70`.
- Naming: unit tests use `*.test.ts`; end-to-end use `*.e2e.test.ts`.
- Coverage command: `pnpm test:coverage`.
- For UI or platform changes, include the corresponding scope in your test command set (e.g. UI tests, `apps/*` smoke/e2e where relevant).

## Commit & Pull Request Guidelines

- Commit messages follow Conventional Commits style observed in history, e.g. `feat(cli): ...`, `fix(gateway): ...`, `chore: ...`.
- PRs should summarize: what changed, why it matters, scope boundary, and verification performed.
- Include linked issue(s) in PR description (`Closes #<id>` / `Related #<id>`).
- Provide risk-aware verification notes and any config/env details needed to reproduce.

## Security & Configuration Tips

- Never commit real tokens, phone numbers, personal IDs, or local credentials.
- Use placeholders in docs/tests and avoid logging secrets.
- After config changes, validate with normal project checks (`pnpm check`, tests) and, where applicable, runtime sanity checks (gateway start/doctor flow).
