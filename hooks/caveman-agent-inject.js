#!/usr/bin/env node
// caveman — PreToolUse hook for Agent/TeamCreate prompt injection
//
// Runs before Agent and TeamCreate tool calls.
// In subagent mode: prepends caveman boot directive to the agent prompt.
// All other modes or unrecognised schemas: silent no-op (exit 0, no stdout).
// Never exits non-zero — must never block a tool call.

const { getDefaultMode, getSubagentIntensity } = require('./caveman-config');

let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdinData += chunk; });
process.stdin.on('end', () => {
  try {
    const { tool_name, tool_input } = JSON.parse(stdinData);

    if (getDefaultMode() !== 'subagent') {
      process.exit(0);
    }

    const intensity = getSubagentIntensity();
    const directive =
      `[CAVEMAN MODE: active, level: ${intensity}. Apply caveman rules throughout. Only fluff die.]\n\n`;

    let modified = null;

    if (tool_name === 'Agent' && typeof tool_input.prompt === 'string') {
      modified = { prompt: directive + tool_input.prompt };
    } else if (tool_name === 'TeamCreate') {
      if (typeof tool_input.systemPrompt === 'string') {
        modified = { systemPrompt: directive + tool_input.systemPrompt };
      } else if (typeof tool_input.prompt === 'string') {
        modified = { prompt: directive + tool_input.prompt };
      }
    }

    if (modified) {
      process.stdout.write(JSON.stringify({ decision: 'modify', parameters: modified }));
    }
    process.exit(0);
  } catch (e) {
    // Silent fail — never block a tool call due to hook errors
    process.exit(0);
  }
});
