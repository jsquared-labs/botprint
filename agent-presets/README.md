# Agent Presets

Drop-in instructions for using Botprint from Claude Code, Codex, Cursor, browser-use, or any other agent loop that follows the AGENTS.md convention. They tell an agent when to reach for Botprint, how to run it, what to parse, and what the common findings usually mean.

Agents working *on* Botprint itself should read `CONTRIBUTING.md` and `docs/agent-usage.md` instead.

## Claude Code skill

Copy `claude-code/` into `~/.claude/skills/botprint/` (user-level) or `.claude/skills/botprint/` (project-level):

```bash
mkdir -p ~/.claude/skills/botprint
cp claude-code/SKILL.md ~/.claude/skills/botprint/SKILL.md
```

## AGENTS.md snippet

Codex CLI, Cursor, browser-use, and most other harnesses read `AGENTS.md` at the repo root. Append `agents-md/botprint.md` to it, or copy it in if the file does not exist:

```bash
cp agents-md/botprint.md ./AGENTS.md
```

## Prerequisite

The presets call `botprint` directly. Install a release binary onto `PATH`, run `bun install -g botprint`, or use `bunx botprint` (see the README's Install section).
