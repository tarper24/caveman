#!/usr/bin/env node
// caveman — shared configuration resolver
//
// Resolution order for default mode:
//   1. CAVEMAN_DEFAULT_MODE environment variable
//   2. Config file defaultMode field:
//      - $XDG_CONFIG_HOME/caveman/config.json (any platform, if set)
//      - ~/.config/caveman/config.json (macOS / Linux fallback)
//      - %APPDATA%\caveman\config.json (Windows fallback)
//   3. 'full'

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_MODES = [
  'off', 'lite', 'full', 'ultra',
  'wenyan-lite', 'wenyan', 'wenyan-full', 'wenyan-ultra',
  'commit', 'review', 'compress',
  'subagent'
];

const VALID_INTENSITIES = ['lite', 'full', 'ultra'];

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'caveman');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'caveman'
    );
  }
  return path.join(os.homedir(), '.config', 'caveman');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function getDefaultMode() {
  // 1. Environment variable (highest priority)
  const envMode = process.env.CAVEMAN_DEFAULT_MODE;
  if (envMode && VALID_MODES.includes(envMode.toLowerCase())) {
    return envMode.toLowerCase();
  }

  // 2. Config file
  try {
    const configPath = getConfigPath();
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.defaultMode && VALID_MODES.includes(config.defaultMode.toLowerCase())) {
      return config.defaultMode.toLowerCase();
    }
  } catch (e) {
    // Config file doesn't exist or is invalid — fall through
  }

  // 3. Default
  return 'full';
}

function getSubagentIntensity() {
  // 1. Environment variable
  const envVal = (process.env.CAVEMAN_SUBAGENT_INTENSITY || '').toLowerCase();
  if (VALID_INTENSITIES.includes(envVal)) return envVal;

  // 2. Config file
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    const cfgVal = (config.subagentIntensity || '').toLowerCase();
    if (VALID_INTENSITIES.includes(cfgVal)) return cfgVal;
  } catch (e) {}

  // 3. Default
  return 'full';
}

// Shared SKILL.md filtering — used by both SessionStart and SubagentStart hooks.
// Reads SKILL.md, strips frontmatter, filters intensity table rows and examples
// to only the active level, returns formatted string ready for injection.
function buildCavemanRules(intensity) {
  const fs = require('fs');
  const path = require('path');
  let skillContent = '';
  try {
    skillContent = fs.readFileSync(
      path.join(__dirname, '..', 'skills', 'caveman', 'SKILL.md'), 'utf8'
    );
  } catch (e) {}

  if (skillContent) {
    const body = skillContent.replace(/^---[\s\S]*?---\s*/, '');
    const filtered = body.split('\n').reduce((acc, line) => {
      const tableRowMatch = line.match(/^\|\s*\*\*(\S+?)\*\*\s*\|/);
      if (tableRowMatch) {
        if (tableRowMatch[1] === intensity) acc.push(line);
        return acc;
      }
      const exampleMatch = line.match(/^- (\S+?):\s/);
      if (exampleMatch) {
        if (exampleMatch[1] === intensity) acc.push(line);
        return acc;
      }
      acc.push(line);
      return acc;
    }, []);
    return 'CAVEMAN MODE ACTIVE — level: ' + intensity + '\n\n' + filtered.join('\n');
  }

  // Fallback when SKILL.md not found (standalone install without skills dir)
  return 'CAVEMAN MODE ACTIVE — level: ' + intensity + '\n\n' +
    'Respond terse like smart caveman. All technical substance stay. Only fluff die.\n\n' +
    'Drop: articles, filler, pleasantries, hedging. Fragments OK. Short synonyms. ' +
    'Technical terms exact. Code blocks unchanged.\n\n' +
    'ACTIVE EVERY RESPONSE. Off only: "stop caveman" / "normal mode".';
}

module.exports = { getDefaultMode, getSubagentIntensity, buildCavemanRules, getConfigDir, getConfigPath, VALID_MODES };
