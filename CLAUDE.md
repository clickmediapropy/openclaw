# OpenClaw — Developer Reference

## Source Structure

```
src/
├── agents/          # Agent runner, auth profiles, model config, skills system
├── channels/        # Channel infrastructure (allow-from, routing, config)
├── config/          # Config loading and validation
├── gateway/         # WebSocket gateway server, protocol, health
├── telegram/        # Telegram channel implementation (grammY)
├── whatsapp/        # WhatsApp channel implementation (Baileys)
├── plugins/         # Plugin loader and SDK
├── sessions/        # Session management and persistence
├── routing/         # Message routing logic
├── cli/             # CLI commands
└── entry.ts         # Gateway entry point
```

## Test Commands

```bash
# Fast unit tests
pnpm test:fast

# All unit tests
pnpm test

# E2E tests
pnpm test:e2e

# All (lint + build + test + e2e)
pnpm test:all

# Build
pnpm build
```

## Plugin Development

Plugins are TypeScript modules loaded at runtime via jiti.

```bash
# List installed plugins
openclaw plugins list

# Install an official plugin
openclaw plugins install @openclaw/voice-call
```

Key plugin docs:
- `docs/tools/plugin.md` — Plugin overview and manifest
- `docs/tools/creating-skills.md` — Writing agent skills

## Key Docs

| Topic | File |
|-------|------|
| Gateway architecture | `docs/concepts/architecture.md` |
| Configuration reference | `docs/gateway/configuration-reference.md` |
| Channel routing | `docs/channels/channel-routing.md` |
| Plugin API | `docs/tools/plugin.md` |
| Agent skills | `docs/tools/creating-skills.md` |
| Security model | `docs/gateway/security/` |

## Config Format

`openclaw.json` is JSON5 (comments and trailing commas allowed). Schema is validated on gateway start. A single invalid field crashes the entire gateway.

## Submodule Note

This repo is a git submodule of `openclaw-meta`. After commits here, run in the outer repo:
```bash
git add openclaw && git commit -m "chore: bump openclaw submodule" && git push
```
