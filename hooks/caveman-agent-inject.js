#!/usr/bin/env node
// caveman — SubagentStart hook for Agent/TeamCreate context injection
//
// Fires when a subagent is spawned via Agent or TeamCreate tool.
// In subagent mode: injects caveman boot directive into the subagent's context.
// All other modes: silent no-op (exit 0, no stdout).
// Never exits non-zero — must never block subagent spawning.

const { getDefaultMode, getSubagentIntensity } = require('./caveman-config');

let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdinData += chunk; });
process.stdin.on('end', () => {
  try {
    // stdin carries SubagentStart metadata (agent_id, agent_type, etc.)
    // not needed for mode-based decision — consumed to satisfy protocol
    JSON.parse(stdinData);

    if (getDefaultMode() !== 'subagent') {
      process.exit(0);
    }

    const intensity = getSubagentIntensity();
    const directive =
      `[CAVEMAN MODE: active, level: ${intensity}. Apply caveman rules throughout. Only fluff die.]`;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: directive,
      },
    }));
    process.exit(0);
  } catch (e) {
    // Silent fail — never block subagent spawning due to hook errors
    process.exit(0);
  }
});
