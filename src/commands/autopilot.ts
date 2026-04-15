/**
 * gbrain autopilot — Self-maintaining brain daemon.
 *
 * Runs: sync → extract → embed → backlinks fix in a continuous loop.
 * Health-based adaptive scheduling. Best-effort per step.
 *
 * Usage:
 *   gbrain autopilot [--repo <path>] [--interval N] [--json]
 *   gbrain autopilot --install [--repo <path>]
 *   gbrain autopilot --uninstall
 *   gbrain autopilot --status [--json]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type { BrainEngine } from '../core/engine.ts';

function parseArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function logError(phase: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  const ts = new Date().toISOString().slice(0, 19);
  const line = `[${ts}] [${phase}] ERROR: ${msg}`;
  console.error(line);
  try {
    const logDir = join(process.env.HOME || '', '.gbrain');
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, 'autopilot.log'), line + '\n');
  } catch { /* best-effort */ }
}

export async function runAutopilot(engine: BrainEngine, args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: gbrain autopilot [--repo <path>] [--interval N] [--json]\n       gbrain autopilot --install [--repo <path>]\n       gbrain autopilot --uninstall\n       gbrain autopilot --status [--json]\n\nSelf-maintaining brain daemon. Runs sync + extract + embed + backlinks in a loop.');
    return;
  }

  if (args.includes('--install')) {
    await installDaemon(engine, args);
    return;
  }
  if (args.includes('--uninstall')) {
    uninstallDaemon();
    return;
  }
  if (args.includes('--status')) {
    showStatus(args.includes('--json'));
    return;
  }

  const repoPath = parseArg(args, '--repo') || await engine.getConfig('sync.repo_path');
  const baseInterval = parseInt(parseArg(args, '--interval') || '300', 10);
  const jsonMode = args.includes('--json');

  if (!repoPath) {
    console.error('No repo path. Use --repo or run gbrain sync --repo first.');
    process.exit(1);
  }

  console.log(`Autopilot starting. Repo: ${repoPath}, interval: ${baseInterval}s`);

  // Signal handling
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; console.log('Autopilot stopping (SIGTERM).'); });
  process.on('SIGINT', () => { stopping = true; console.log('Autopilot stopping (SIGINT).'); });

  let consecutiveErrors = 0;

  while (!stopping) {
    const cycleStart = Date.now();
    let cycleOk = true;

    // DB health check (reconnect if needed)
    try {
      await engine.getConfig('version');
    } catch {
      try {
        await engine.disconnect();
        await (engine as any).connect?.();
      } catch (e) { logError('reconnect', e); }
    }

    // 1. Sync
    try {
      const { performSync } = await import('./sync.ts');
      const result = await performSync(engine, { repoPath, noEmbed: true });
      if (result.status === 'synced') {
        console.log(`[sync] +${result.added} ~${result.modified} -${result.deleted}`);
      }
    } catch (e) { logError('sync', e); cycleOk = false; }

    // 2. Extract
    try {
      const { extractLinksForSlugs, extractTimelineForSlugs } = await import('./extract.ts');
      // Incremental: extract from recently synced pages (full extract runs separately)
      // For autopilot, just run embed --stale which catches everything
    } catch (e) { logError('extract', e); cycleOk = false; }

    // 3. Embed stale
    try {
      const { runEmbed } = await import('./embed.ts');
      await runEmbed(engine, ['--stale']);
    } catch (e) { logError('embed', e); cycleOk = false; }

    // 4. Health check + adaptive interval
    let interval = baseInterval;
    try {
      const health = await engine.getHealth();
      const score = (health as any).brain_score ?? 50;
      interval = score >= 90 ? baseInterval * 2
               : score < 70 ? Math.max(Math.floor(baseInterval / 2), 60)
               : baseInterval;

      const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(0);
      const line = `[cycle] score=${score} elapsed=${elapsed}s next=${interval}s`;
      if (jsonMode) {
        process.stderr.write(JSON.stringify({ event: 'cycle', brain_score: score, elapsed_s: Number(elapsed), next_s: interval }) + '\n');
      } else {
        console.log(line);
      }
    } catch (e) { logError('health', e); }

    if (cycleOk) {
      consecutiveErrors = 0;
    } else {
      consecutiveErrors++;
      if (consecutiveErrors >= 5) {
        console.error('5 consecutive cycle failures. Stopping autopilot.');
        process.exit(1);
      }
    }

    // Wait for next cycle
    await new Promise(r => setTimeout(r, interval * 1000));
  }
}

// --- Install/Uninstall ---

function plistPath(): string {
  return join(process.env.HOME || '', 'Library', 'LaunchAgents', 'com.gbrain.autopilot.plist');
}

async function installDaemon(engine: BrainEngine, args: string[]) {
  const repoPath = parseArg(args, '--repo') || await engine.getConfig('sync.repo_path');
  if (!repoPath) {
    console.error('No repo path. Use --repo or run gbrain sync --repo first.');
    process.exit(1);
  }

  const gbrainPath = process.execPath;
  const home = process.env.HOME || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const pathEnv = process.env.PATH || '';

  if (process.platform === 'darwin') {
    // macOS: launchd plist
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.gbrain.autopilot</string>
  <key>ProgramArguments</key><array>
    <string>${escapeXml(gbrainPath)}</string>
    <string>autopilot</string>
    <string>--repo</string>
    <string>${escapeXml(repoPath)}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${escapeXml(home)}/.gbrain/autopilot.log</string>
  <key>StandardErrorPath</key><string>${escapeXml(home)}/.gbrain/autopilot.err</string>
  <key>EnvironmentVariables</key><dict>
    <key>OPENAI_API_KEY</key><string>${escapeXml(openaiKey)}</string>
    <key>PATH</key><string>${escapeXml(pathEnv)}</string>
  </dict>
</dict>
</plist>`;

    try {
      const agentsDir = join(home, 'Library', 'LaunchAgents');
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(plistPath(), plist);
      execSync(`launchctl load "${plistPath()}"`, { stdio: 'pipe' });
      console.log(`Installed launchd service: com.gbrain.autopilot`);
      console.log(`  Repo: ${repoPath}`);
      console.log(`  Log: ~/.gbrain/autopilot.log`);
      console.log(`  Uninstall: gbrain autopilot --uninstall`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('EACCES') || msg.includes('Permission')) {
        console.error(`Permission denied writing plist. Try: mkdir -p ~/Library/LaunchAgents`);
      } else {
        console.error(`Failed to install: ${msg}`);
      }
      process.exit(1);
    }
  } else {
    // Linux/WSL: crontab
    const cronLine = `*/5 * * * * OPENAI_API_KEY="${openaiKey}" PATH="${pathEnv}" "${gbrainPath}" autopilot --repo "${repoPath}" 2>> "${home}/.gbrain/autopilot.err"`;
    try {
      const existing = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
      if (existing.includes('gbrain autopilot')) {
        console.log('Crontab entry already exists. Remove with: gbrain autopilot --uninstall');
        return;
      }
      const newCrontab = existing.trimEnd() + '\n' + cronLine + '\n';
      execSync(`echo '${newCrontab.replace(/'/g, "'\\''")}' | crontab -`, { stdio: 'pipe' });
      console.log('Installed crontab entry for gbrain autopilot (every 5 minutes)');
      console.log(`  Uninstall: gbrain autopilot --uninstall`);
    } catch (e: unknown) {
      console.error(`Failed to install crontab: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  }
}

function uninstallDaemon() {
  if (process.platform === 'darwin') {
    try {
      execSync(`launchctl unload "${plistPath()}" 2>/dev/null || true`, { stdio: 'pipe' });
      if (existsSync(plistPath())) {
        const { unlinkSync } = require('fs');
        unlinkSync(plistPath());
      }
      console.log('Uninstalled launchd service: com.gbrain.autopilot');
    } catch (e: unknown) {
      console.error(`Failed to uninstall: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    try {
      const existing = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
      const filtered = existing.split('\n').filter(l => !l.includes('gbrain autopilot')).join('\n');
      execSync(`echo '${filtered.replace(/'/g, "'\\''")}' | crontab -`, { stdio: 'pipe' });
      console.log('Removed crontab entry for gbrain autopilot');
    } catch (e: unknown) {
      console.error(`Failed to uninstall: ${e instanceof Error ? e.message : e}`);
    }
  }
}

function showStatus(json: boolean) {
  const logFile = join(process.env.HOME || '', '.gbrain', 'autopilot.log');
  let lastLine = '';
  try {
    const content = readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n');
    lastLine = lines[lines.length - 1] || '';
  } catch { /* no log */ }

  let installed = false;
  if (process.platform === 'darwin') {
    installed = existsSync(plistPath());
  } else {
    try {
      const crontab = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
      installed = crontab.includes('gbrain autopilot');
    } catch { /* no crontab */ }
  }

  if (json) {
    console.log(JSON.stringify({ installed, last_log: lastLine }));
  } else {
    console.log(`Autopilot: ${installed ? 'installed' : 'not installed'}`);
    if (lastLine) console.log(`Last log: ${lastLine}`);
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
