# Skills for AI agents

> _Last reviewed: 2026-05-26._

This directory holds **agent-readable workflow recipes** — concrete, repeatable procedures that any AI assistant (Claude Code, Cursor, Copilot, others) can invoke to do the same thing the same way.

Skills are agent-neutral by design (plain Markdown, no Claude-specific format). `.claude/skills/` may mirror individual entries when Claude Code's slash-command surface is useful, but **`skills/` here is the canonical source**.

## When to add a skill

Add a skill only when **all** are true:

- the procedure is repeated more than once,
- the procedure is non-trivial (more than "run one command"),
- the procedure does not belong in [`CONTRIBUTING.md`](../CONTRIBUTING.md) (which is for humans) or [`AGENTS.md`](../AGENTS.md) (which is general operating context).

If a one-line command in `AGENTS.md` already covers it, don't make a skill.

## File layout

```
skills/
├── README.md          # this file
└── <skill-name>/
    └── SKILL.md       # the recipe: goal, when to use, steps, acceptance check
```

`SKILL.md` template (keep it short):

```markdown
# Skill: <name>

## Goal
One sentence — what this skill produces.

## When to use
Trigger phrases / situations where this skill applies.

## Steps
1. ...
2. ...

## Acceptance check
How the agent (or a reviewer) confirms the skill ran correctly.
```

## Current skills

*(none yet — first skill lands when there is a concrete trigger; see `PROJECT-BRIEF.md` Track 5)*
