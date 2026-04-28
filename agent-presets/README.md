# Agent Presets

Drop-in agent instructions for using Botprint as a diagnostic tool from Claude Code, Codex, Cursor, browser-use, or any other agent loop that follows the AGENTS.md convention.

These presets help an agent decide *when* to reach for Botprint, *how* to run it, what to parse, and what kinds of requests to refuse.

They are not intended for agents working *on* Botprint itself — that audience reads `CONTRIBUTING.md` and `docs/agent-usage.md` directly.

## Pick the format your agent uses

### Claude Code skill

Copy `claude-code/` into `~/.claude/skills/botprint/` (user-level) or `.claude/skills/botprint/` (project-level):

```bash
mkdir -p ~/.claude/skills/botprint
cp claude-code/SKILL.md ~/.claude/skills/botprint/SKILL.md
```

The skill becomes invocable by name. Claude Code will pick it up the next time it scans skills.

### AGENTS.md snippet

Codex CLI, Cursor, browser-use, and most other agent harnesses read `AGENTS.md` (or a per-provider equivalent) at the root of your repo. Copy the contents of `agents-md/botprint.md` into that file.

If your repo doesn't have an `AGENTS.md` yet:

```bash
cp agents-md/botprint.md ./AGENTS.md
```

If it does, append the section under a heading like `## Browser Diagnostics (Botprint)`.

## Prerequisite

The agent presets assume `botprint` is on `PATH`. Either:

- Install the compiled binary somewhere on `PATH`, or
- Run from source via `bun run src/cli.ts` and adapt the recipes accordingly.

