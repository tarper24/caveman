#!/usr/bin/env node
// caveman — SubagentStart hook for subagent context injection
//
// Fires when a subagent is spawned via Agent, TeamCreate, or any other
// subagent tool. In subagent mode: injects full filtered caveman ruleset
// into the subagent's context. All other modes: silent no-op (exit 0, no stdout).
// Never exits non-zero — must never block subagent spawning.
//
// Injects rules via SubagentStart rather than relying solely on SessionStart
// because isSubagent() in caveman-activate.js may not reliably detect
// Agent-spawned subagents (parent process name depends on how Claude Code runs).
// SubagentStart ensures correct behavior regardless of SessionStart detection.

const { getDefaultMode, getSubagentIntensity, buildCavemanRules } = require('./caveman-config');

let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdinData += chunk; });
process.stdin.on('end', () => {
  try {
    // SubagentStart metadata on stdin is not needed for mode-based injection
    if (getDefaultMode() !== 'subagent') {
      process.exit(0);
    }

    const intensity = getSubagentIntensity();

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: buildCavemanRules(intensity),
      },
    }));
    process.exit(0);
  } catch (e) {
    // Silent fail — never block subagent spawning due to hook errors
    process.exit(0);
  }
});
