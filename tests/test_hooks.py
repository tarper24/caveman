import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent


class HookScriptTests(unittest.TestCase):
    def run_cmd(self, cmd, home):
        env = os.environ.copy()
        env["HOME"] = str(home)
        env["USERPROFILE"] = str(home)
        return subprocess.run(
            cmd,
            cwd=REPO_ROOT,
            env=env,
            text=True,
            capture_output=True,
            check=True,
        )

    def test_install_upgrades_old_two_file_install(self):
        with tempfile.TemporaryDirectory(prefix="caveman-hooks-upgrade-") as tmp:
            home = Path(tmp)
            hooks_dir = home / ".claude" / "hooks"
            hooks_dir.mkdir(parents=True)
            (home / ".claude" / "settings.json").write_text("{}\n")
            (hooks_dir / "caveman-activate.js").write_text("")
            (hooks_dir / "caveman-mode-tracker.js").write_text("")

            self.run_cmd(["bash", "hooks/install.sh"], home)

            statusline = hooks_dir / "caveman-statusline.sh"
            self.assertTrue(statusline.exists(), "upgrade should install statusline script")

            settings = json.loads((home / ".claude" / "settings.json").read_text())
            self.assertIn("statusLine", settings)
            self.assertIn(str(statusline), settings["statusLine"]["command"])

    def test_install_reconfigures_missing_statusline(self):
        with tempfile.TemporaryDirectory(prefix="caveman-hooks-statusline-") as tmp:
            home = Path(tmp)
            claude_dir = home / ".claude"
            hooks_dir = claude_dir / "hooks"
            hooks_dir.mkdir(parents=True)

            for name in ("caveman-activate.js", "caveman-mode-tracker.js", "caveman-statusline.sh"):
                (hooks_dir / name).write_text("")

            settings = {
                "hooks": {
                    "SessionStart": [
                        {
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": f'node "{hooks_dir / "caveman-activate.js"}"',
                                }
                            ]
                        }
                    ],
                    "UserPromptSubmit": [
                        {
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": f'node "{hooks_dir / "caveman-mode-tracker.js"}"',
                                }
                            ]
                        }
                    ],
                }
            }
            (claude_dir / "settings.json").write_text(json.dumps(settings, indent=2) + "\n")

            result = self.run_cmd(["bash", "hooks/install.sh"], home)

            self.assertNotIn("Nothing to do", result.stdout)

            updated = json.loads((claude_dir / "settings.json").read_text())
            self.assertIn("statusLine", updated)
            self.assertIn(str(hooks_dir / "caveman-statusline.sh"), updated["statusLine"]["command"])

    def test_uninstall_preserves_custom_statusline(self):
        with tempfile.TemporaryDirectory(prefix="caveman-hooks-uninstall-") as tmp:
            home = Path(tmp)
            claude_dir = home / ".claude"
            hooks_dir = claude_dir / "hooks"
            hooks_dir.mkdir(parents=True)

            for name in ("caveman-activate.js", "caveman-mode-tracker.js", "caveman-statusline.sh"):
                (hooks_dir / name).write_text("")

            settings = {
                "statusLine": {
                    "type": "command",
                    "command": "bash /tmp/custom-status-with-caveman.sh",
                },
                "hooks": {
                    "SessionStart": [
                        {
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": f'node "{hooks_dir / "caveman-activate.js"}"',
                                }
                            ]
                        }
                    ],
                    "UserPromptSubmit": [
                        {
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": f'node "{hooks_dir / "caveman-mode-tracker.js"}"',
                                }
                            ]
                        }
                    ],
                },
            }
            (claude_dir / "settings.json").write_text(json.dumps(settings, indent=2) + "\n")

            self.run_cmd(["bash", "hooks/uninstall.sh"], home)

            updated = json.loads((claude_dir / "settings.json").read_text())
            self.assertEqual(
                updated["statusLine"]["command"],
                "bash /tmp/custom-status-with-caveman.sh",
            )
            self.assertNotIn("hooks", updated)

    def test_activate_does_not_nudge_when_custom_statusline_exists(self):
        with tempfile.TemporaryDirectory(prefix="caveman-hooks-activate-") as tmp:
            home = Path(tmp)
            claude_dir = home / ".claude"
            claude_dir.mkdir(parents=True)
            (claude_dir / "settings.json").write_text(
                json.dumps(
                    {
                        "statusLine": {
                            "type": "command",
                            "command": "bash /tmp/my-statusline.sh",
                        }
                    }
                )
                + "\n"
            )

            result = self.run_cmd(["node", "hooks/caveman-activate.js"], home)

            self.assertNotIn("STATUSLINE SETUP NEEDED", result.stdout)
            self.assertEqual((claude_dir / ".caveman-active").read_text(), "full")

    def test_config_subagent_is_valid_mode(self):
        """subagent must be in VALID_MODES so env var + config file accept it."""
        env = os.environ.copy()
        env["CAVEMAN_DEFAULT_MODE"] = "subagent"
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / ".claude").mkdir()
            (home / ".claude" / "settings.json").write_text("{}\n")
            env["HOME"] = str(home)
            # caveman-activate.js writes flag file only for known modes.
            # subagent is handled specially so it won't write "subagent"
            # to flag — but the script must not exit with an error.
            result = subprocess.run(
                ["node", "hooks/caveman-activate.js"],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_config_subagent_intensity_env_override(self):
        """CAVEMAN_SUBAGENT_INTENSITY env var sets intensity for subagent sessions."""
        env = os.environ.copy()
        env["CAVEMAN_DEFAULT_MODE"] = "subagent"
        env["CAVEMAN_SUBAGENT_INTENSITY"] = "ultra"
        env["CAVEMAN_FORCE_SUBAGENT"] = "1"
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / ".claude").mkdir()
            (home / ".claude" / "settings.json").write_text("{}\n")
            env["HOME"] = str(home)
            result = subprocess.run(
                ["node", "hooks/caveman-activate.js"],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )
            flag = home / ".claude" / ".caveman-active"
            self.assertTrue(flag.exists())
            self.assertEqual(flag.read_text(), "subagent-ultra")

    def test_config_subagent_intensity_default_is_full(self):
        """When subagentIntensity not set, default is full."""
        env = os.environ.copy()
        env["CAVEMAN_DEFAULT_MODE"] = "subagent"
        env.pop("CAVEMAN_SUBAGENT_INTENSITY", None)
        env["CAVEMAN_FORCE_SUBAGENT"] = "1"
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / ".claude").mkdir()
            (home / ".claude" / "settings.json").write_text("{}\n")
            env["HOME"] = str(home)
            result = subprocess.run(
                ["node", "hooks/caveman-activate.js"],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )
            flag = home / ".claude" / ".caveman-active"
            self.assertEqual(flag.read_text(), "subagent-full")

    def test_issubagent_forced_true(self):
        """CAVEMAN_FORCE_SUBAGENT=1 makes isSubagent() return true (test seam)."""
        env = os.environ.copy()
        env["CAVEMAN_DEFAULT_MODE"] = "subagent"
        env["CAVEMAN_FORCE_SUBAGENT"] = "1"
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / ".claude").mkdir()
            (home / ".claude" / "settings.json").write_text("{}\n")
            env["HOME"] = str(home)
            result = subprocess.run(
                ["node", "hooks/caveman-activate.js"],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )
            flag = home / ".claude" / ".caveman-active"
            # When forced subagent, flag file must be written
            self.assertTrue(flag.exists(), "flag file must exist in subagent session")
            self.assertEqual(flag.read_text(), "subagent-full")

    def test_issubagent_forced_false(self):
        """CAVEMAN_FORCE_SUBAGENT=0 makes isSubagent() return false (main session path)."""
        env = os.environ.copy()
        env["CAVEMAN_DEFAULT_MODE"] = "subagent"
        env["CAVEMAN_FORCE_SUBAGENT"] = "0"
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / ".claude").mkdir()
            (home / ".claude" / "settings.json").write_text(
                '{"statusLine": {"type": "command", "command": "bash /tmp/fake.sh"}}\n'
            )
            env["HOME"] = str(home)
            result = subprocess.run(
                ["node", "hooks/caveman-activate.js"],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )
            flag = home / ".claude" / ".caveman-active"
            # Main session must NOT write flag
            self.assertFalse(flag.exists(), "flag file must not exist in main session")


    def test_subagent_session_activates_caveman(self):
        """Subagent session: flag written, caveman rules emitted in stdout."""
        env = os.environ.copy()
        env["CAVEMAN_DEFAULT_MODE"] = "subagent"
        env["CAVEMAN_FORCE_SUBAGENT"] = "1"
        env.pop("CAVEMAN_SUBAGENT_INTENSITY", None)
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / ".claude").mkdir()
            (home / ".claude" / "settings.json").write_text(
                '{"statusLine": {"type": "command", "command": "bash /tmp/fake.sh"}}\n'
            )
            env["HOME"] = str(home)
            result = subprocess.run(
                ["node", "hooks/caveman-activate.js"],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )
            flag = home / ".claude" / ".caveman-active"
            self.assertTrue(flag.exists())
            self.assertEqual(flag.read_text(), "subagent-full")
            self.assertIn("CAVEMAN MODE ACTIVE", result.stdout)

    def test_main_session_emits_agent_rules_not_caveman(self):
        """Main session: no flag file, caveman-agents rules in stdout, no full caveman."""
        env = os.environ.copy()
        env["CAVEMAN_DEFAULT_MODE"] = "subagent"
        env["CAVEMAN_FORCE_SUBAGENT"] = "0"
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / ".claude").mkdir()
            (home / ".claude" / "settings.json").write_text(
                '{"statusLine": {"type": "command", "command": "bash /tmp/fake.sh"}}\n'
            )
            env["HOME"] = str(home)
            result = subprocess.run(
                ["node", "hooks/caveman-activate.js"],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )
            flag = home / ".claude" / ".caveman-active"
            self.assertFalse(flag.exists(), "main session must not write flag")
            self.assertNotIn("CAVEMAN MODE ACTIVE", result.stdout)
            # caveman-agents rules must be present
            self.assertIn("Agent tool", result.stdout)

    def test_subagent_ultra_intensity(self):
        """CAVEMAN_SUBAGENT_INTENSITY=ultra writes ultra to flag in subagent session."""
        env = os.environ.copy()
        env["CAVEMAN_DEFAULT_MODE"] = "subagent"
        env["CAVEMAN_FORCE_SUBAGENT"] = "1"
        env["CAVEMAN_SUBAGENT_INTENSITY"] = "ultra"
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / ".claude").mkdir()
            (home / ".claude" / "settings.json").write_text(
                '{"statusLine": {"type": "command", "command": "bash /tmp/fake.sh"}}\n'
            )
            env["HOME"] = str(home)
            subprocess.run(
                ["node", "hooks/caveman-activate.js"],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )
            flag = home / ".claude" / ".caveman-active"
            self.assertEqual(flag.read_text(), "subagent-ultra")

    def _run_inject_hook(self, agent_type="general-purpose", extra_env=None):
        """Helper: run caveman-agent-inject.js with SubagentStart JSON on stdin."""
        env = os.environ.copy()
        if extra_env:
            env.update(extra_env)
        stdin_data = json.dumps({
            "hook_event_name": "SubagentStart",
            "session_id": "test-session",
            "agent_id": "test-agent-id",
            "agent_type": agent_type,
        })
        return subprocess.run(
            ["node", "hooks/caveman-agent-inject.js"],
            cwd=REPO_ROOT,
            env=env,
            input=stdin_data,
            text=True,
            capture_output=True,
            check=True,
        )

    def test_inject_agent_prompt_in_subagent_mode(self):
        """Inject hook emits caveman additionalContext for subagent in subagent mode."""
        result = self._run_inject_hook(
            extra_env={"CAVEMAN_DEFAULT_MODE": "subagent"},
        )
        out = json.loads(result.stdout)
        ctx = out["hookSpecificOutput"]["additionalContext"]
        self.assertIn("CAVEMAN MODE", ctx)
        self.assertEqual(out["hookSpecificOutput"]["hookEventName"], "SubagentStart")

    def test_inject_noop_for_non_subagent_mode(self):
        """Inject hook is silent when mode is not subagent."""
        result = self._run_inject_hook(
            extra_env={"CAVEMAN_DEFAULT_MODE": "full"},
        )
        self.assertEqual(result.stdout, "")

    def test_inject_teamcreate_systemprompt(self):
        """Inject hook fires for any agent type (TeamCreate agents included)."""
        result = self._run_inject_hook(
            agent_type="code-reviewer",
            extra_env={"CAVEMAN_DEFAULT_MODE": "subagent"},
        )
        out = json.loads(result.stdout)
        self.assertIn("CAVEMAN MODE", out["hookSpecificOutput"]["additionalContext"])

    def test_inject_uses_configured_intensity(self):
        """Boot directive includes the resolved subagentIntensity."""
        result = self._run_inject_hook(
            extra_env={"CAVEMAN_DEFAULT_MODE": "subagent", "CAVEMAN_SUBAGENT_INTENSITY": "ultra"},
        )
        out = json.loads(result.stdout)
        self.assertIn("ultra", out["hookSpecificOutput"]["additionalContext"])

    def test_inject_fires_for_all_agent_types(self):
        """Inject hook fires for all agent types in subagent mode (no filtering needed)."""
        result = self._run_inject_hook(
            agent_type="Bash",
            extra_env={"CAVEMAN_DEFAULT_MODE": "subagent"},
        )
        out = json.loads(result.stdout)
        self.assertIn("CAVEMAN MODE", out["hookSpecificOutput"]["additionalContext"])


if __name__ == "__main__":
    unittest.main()
