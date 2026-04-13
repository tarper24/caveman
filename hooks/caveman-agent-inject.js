#!/usr/bin/env node
// caveman — SubagentStart hook for Agent/TeamCreate context injection
//
// Fires when a subagent is spawned via Agent or TeamCreate tool.
// In subagent mode: injects full caveman SKILL.md into the subagent's context.
// All other modes: silent no-op (exit 0, no stdout).
// Never exits non-zero — must never block subagent spawning.
//
// Injects full SKILL.md rather than a short directive because isSubagent()
// in caveman-activate.js may not reliably detect Agent-spawned subagents
// (parent process name depends on how Claude Code runs). Full rules here
// ensure correct behavior regardless of SessionStart detection.

const fs = require('fs');
const path = require('path');
const { getDefaultMode, getSubagentIntensity } = require('./caveman-config');

function buildDirective(intensity) {
  let skillContent = '';
  try {
    skillContent = fs.readFileSync(
      path.join(__dirname, '..', 'skills', 'caveman', 'SKILL.md'), 'utf8'
    );
  } catch (e) {}

  if (skillContent) {
    // Strip YAML frontmatter, inject full rules — no intensity filtering
    const body = skillContent.replace(/^---[\s\S]*?---\s*/, '');
    return 'CAVEMAN MODE ACTIVE — level: ' + intensity + '\n\n' + body;
  }

  return `CAVEMAN MODE ACTIVE — level: ${intensity}\n\n` +
    'Respond terse like smart caveman. All technical substance stay. Only fluff die.\n\n' +
    'Drop: articles, filler, pleasantries, hedging. Fragments OK. Short synonyms. ' +
    'Technical terms exact. Code blocks unchanged.\n\n' +
    'ACTIVE EVERY RESPONSE. Off only: "stop caveman" / "normal mode".';
}

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
    const directive = buildDirective(intensity);

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
