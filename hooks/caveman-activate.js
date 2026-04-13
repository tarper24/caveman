#!/usr/bin/env node
// caveman — Claude Code SessionStart activation hook
//
// Runs on every session start:
//   1. Writes flag file at ~/.claude/.caveman-active (statusline reads this)
//   2. Emits caveman ruleset as hidden SessionStart context
//   3. Detects missing statusline config and emits setup nudge

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { getDefaultMode, getSubagentIntensity, buildCavemanRules } = require('./caveman-config');

function isSubagent() {
  // Test seam: allows Python integration tests to exercise both branches
  // without needing a Claude parent process.
  if (process.env.CAVEMAN_FORCE_SUBAGENT === '1') return true;
  if (process.env.CAVEMAN_FORCE_SUBAGENT === '0') return false;

  try {
    const ppid = String(process.ppid);
    const result = process.platform === 'win32'
      ? spawnSync('wmic', ['process', 'where', `ProcessId=${ppid}`, 'get', 'name', '/value'], { encoding: 'utf8' })
      : spawnSync('ps', ['-p', ppid, '-o', 'comm='], { encoding: 'utf8' });
    return result.status === 0 && /claude/i.test(result.stdout);
  } catch (e) {
    return false; // safe fallback — never false-activate
  }
}

const claudeDir = path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.caveman-active');
const settingsPath = path.join(claudeDir, 'settings.json');

const mode = getDefaultMode();

// "off" mode — skip activation entirely, don't write flag or emit rules
if (mode === 'off') {
  try { fs.unlinkSync(flagPath); } catch (e) {}
  process.stdout.write('OK');
  process.exit(0);
}

// subagent mode: behaviour splits on session type
if (mode === 'subagent') {
  if (isSubagent()) {
    // ── Subagent session: activate caveman at configured intensity ──
    const intensity = getSubagentIntensity();
    try {
      fs.mkdirSync(path.dirname(flagPath), { recursive: true });
      fs.writeFileSync(flagPath, 'subagent-' + intensity);
    } catch (e) {}
    // Plugin install: SubagentStart hook already injected rules via additionalContext.
    // Standalone install: no SubagentStart hook — emit rules here as fallback.
    if (!process.env.CLAUDE_PLUGIN_ROOT) {
      process.stdout.write(buildCavemanRules(intensity));
    }
    process.exit(0);
  } else {
    // ── Main session: emit caveman-agents rules as hidden context ──
    let agentSkill = '';
    try {
      agentSkill = fs.readFileSync(
        path.join(__dirname, '..', 'skills', 'caveman-agents', 'SKILL.md'), 'utf8'
      );
    } catch (e) {}

    const agentRules = agentSkill
      ? agentSkill.replace(/^---[\s\S]*?---\s*/, '')
      : 'Write terse when talking TO agents via Agent tool or SendMessage. ' +
        'No pleasantries, no hedging, task-only fragments. User-facing responses unaffected.';

    process.stdout.write('CAVEMAN AGENTS MODE ACTIVE\n\n' + agentRules);
    process.exit(0);
  }
}

// 1. Write flag file
try {
  fs.mkdirSync(path.dirname(flagPath), { recursive: true });
  fs.writeFileSync(flagPath, mode);
} catch (e) {
  // Silent fail -- flag is best-effort, don't block the hook
}

// 2. Emit full caveman ruleset, filtered to the active intensity level.
//    The old 2-sentence summary was too weak — models drifted back to verbose
//    mid-conversation, especially after context compression pruned it away.
//    Full rules with examples anchor behavior much more reliably.
//
//    Reads SKILL.md at runtime so edits to the source of truth propagate
//    automatically — no hardcoded duplication to go stale.

// Modes that have their own independent skill files — not caveman intensity levels.
// For these, emit a short activation line; the skill itself handles behavior.
const INDEPENDENT_MODES = new Set(['commit', 'review', 'compress']);

if (INDEPENDENT_MODES.has(mode)) {
  process.stdout.write('CAVEMAN MODE ACTIVE — level: ' + mode + '. Behavior defined by /caveman-' + mode + ' skill.');
  process.exit(0);
}

// Resolve the canonical label for wenyan alias
const modeLabel = mode === 'wenyan' ? 'wenyan-full' : mode;

let output = buildCavemanRules(modeLabel);

// 3. Detect missing statusline config — nudge Claude to help set it up
try {
  let hasStatusline = false;
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.statusLine) {
      hasStatusline = true;
    }
  }

  if (!hasStatusline) {
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'caveman-statusline.ps1' : 'caveman-statusline.sh';
    const scriptPath = path.join(__dirname, scriptName);
    const command = isWindows
      ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
      : `bash "${scriptPath}"`;
    const statusLineSnippet =
      '"statusLine": { "type": "command", "command": ' + JSON.stringify(command) + ' }';
    output += "\n\n" +
      "STATUSLINE SETUP NEEDED: The caveman plugin includes a statusline badge showing active mode " +
      "(e.g. [CAVEMAN], [CAVEMAN:ULTRA]). It is not configured yet. " +
      "To enable, add this to ~/.claude/settings.json: " +
      statusLineSnippet + " " +
      "Proactively offer to set this up for the user on first interaction.";
  }
} catch (e) {
  // Silent fail — don't block session start over statusline detection
}

process.stdout.write(output);
