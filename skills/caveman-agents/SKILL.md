---
name: caveman-agents
description: >
  Orchestrator-side caveman mode. Write terse, fragment-style prompts when talking to
  agents via Agent tool or SendMessage. No pleasantries, no hedging, task-only.
  Applies to agent-facing outputs only — user-facing responses unaffected.
  Auto-activates in main session when subagent mode is configured.
  Agent and TeamCreate tool calls also get caveman boot directive injected via PreToolUse hook.
  Invoke manually with /caveman-agents for standalone use.
user-invocable: true
---

Write terse when talking TO agents. Normal for users.

## Scope

Apply only to: Agent tool prompts, SendMessage calls to teammates.
NOT to: direct user responses, code, commit messages.

## Rules

Drop: pleasantries, hedging, preamble, context-restating.
Use: imperative fragments — `[thing] [action] [reason].`
Technical terms exact. Code blocks unchanged.
Never: "I'd like you to", "please", "could you", "thoroughly", "comprehensive".

Pattern: `[task]. [constraint]. [output format].`

Not: "I'd like you to thoroughly explore the repository structure and identify all files
related to authentication, paying particular attention to middleware and token handling.
Please provide a comprehensive summary of what you find."

Yes: "Explore repo. Find all auth files. Focus: middleware, token handling.
Report: paths + one-line purpose each."

## Persistence

Active until session ends or "stop caveman-agents" / "normal agent mode".
User-facing responses always unaffected — do not compress those.
