---
name: obsidian-daily-dump
description: Create one Obsidian note per Codex session in a dedicated vault folder and include a backlink to today's daily note. Use when asked to dump session context, log work done, or archive session knowledge in Obsidian.
---

# Obsidian Daily Dump

Create a standalone session note.
Add a backlink from that session note to the daily note.

## Default Paths

Daily note directory:
- `/Users/nsttt/Documents/Nsttt Vault/06 - Journal/Daily`

Session note directory:
- `/Users/nsttt/Documents/Nsttt Vault/06 - Journal/Agent Sessions`

Override with:
- `OBSIDIAN_DAILY_DIR`
- `OBSIDIAN_SESSION_DIR`
- flags `--daily-dir` and `--session-dir`

## Workflow

1. Create a short session title (3-7 words) from what was accomplished.
Example: `Obsidian Session Capture Setup`.

2. Write one short description sentence for the session.
Frontmatter + daily backlink line will be inserted at the top of the note.

3. Build done items as a bullet list only:

```md
- ...
- ...
- ...
```

4. Create the note:

```bash
cat <<'MD' | bun /Users/nsttt/.codex/skills/obsidian-daily-dump/scripts/create_session_note.ts \
  --heading "Obsidian Session Capture Setup" \
  --summary "Implemented Obsidian session capture workflow."
- ...
- ...
- ...
MD
```

5. Confirm printed paths:
- created session note path
- daily note backlink target
- backlink format is wiki-style `[[...]]`

## Guardrails

- Never overwrite an existing session note.
- File content must contain only:
  - YAML frontmatter:
    - tags: `agent-session`
    - date: `<YYYY-MM-DD>`
  - then line: `Daily note: [[...]]`
  - one short description sentence
  - one bullet list of done items
- Keep bullets concrete; avoid filler.
- Use `--date YYYY-MM-DD` to target another daily note date.
- Default filename format: `<Heading> - YYYY-MM-DD.md`.
- `--heading` is required and should be a short descriptive session title.
- `--summary` is required and should be a short description sentence.
- Use `--filename` to force a specific file name.
- Use `--dry-run` to preview file paths and note content.
- Allow script to create the daily note file if missing.

## Script

Path:
- `/Users/nsttt/.codex/skills/obsidian-daily-dump/scripts/create_session_note.ts`

Usage:

```bash
bun create_session_note.ts [--daily-dir PATH] [--session-dir PATH] [--date YYYY-MM-DD] --heading TEXT --summary TEXT [--content TEXT] [--filename NAME.md] [--dry-run]
```

Input source:
- done items from `--content` text, or piped STDIN if `--content` is omitted.
