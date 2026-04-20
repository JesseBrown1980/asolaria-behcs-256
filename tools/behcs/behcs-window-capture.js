#!/usr/bin/env node
/**
 * behcs-window-capture.js — Window-specific + screen-specific capture.
 *
 * NOT full-screen-only. Targets individual windows by PID, name, or class.
 * Each capture target gets a Hilbert glyph code + cube address.
 * Feeds into the BEHCS bus as a capture event.
 *
 * Capture modes:
 *   1. WINDOW — capture a specific window by PID or title match (even if behind other windows)
 *   2. SCREEN — capture a specific monitor by index (multi-monitor)
 *   3. REGION — capture a specific rectangle (x, y, w, h)
 *   4. FULL   — capture entire desktop (legacy, what the old sidecar does)
 *
 * Each capture target is cube-addressed:
 *   hilbertAddress(target_type + ':' + target_id) → glyph
 *   Cube: D15 DEVICE + D13 SURFACE + D44 HEARTBEAT
 *
 * Usage:
 *   node tools/behcs/behcs-window-capture.js --list                    # list all capturable windows
 *   node tools/behcs/behcs-window-capture.js --window "Chrome"         # capture Chrome window
 *   node tools/behcs/behcs-window-capture.js --window-pid 22868        # capture by PID
 *   node tools/behcs/behcs-window-capture.js --screen 0                # capture primary monitor
 *   node tools/behcs/behcs-window-capture.js --full                    # full desktop
 *   node tools/behcs/behcs-window-capture.js --loop 30 --window "Chrome"  # capture every 30s
 *
 * Cube: D15 DEVICE (103823) + D13 SURFACE (68921) + D44 HEARTBEAT (7189057)
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = 'C:/Users/acer/Asolaria';
const CAPTURES_DIR = path.join(ROOT, 'logs/captures/window');
const D0_DIR = path.join(ROOT, 'data/behcs/d0-runtime');
const D_DEST = 'D:/safety-backups/session-20260411-behcs-v6';
const BEHCS_PORT = 4947;
const MAX_CAPTURES = 30;

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
const now = () => new Date().toISOString();

// Load codex for glyph encoding
let codex;
try { codex = require('./codex-bridge'); } catch (_) {
  codex = { hilbertAddress: k => crypto.createHash('sha256').update(String(k)).digest('hex').slice(0, 16) };
}

// ═══════════════════════════════════════════════════════════
// POWERSHELL CAPTURE ENGINE
// ═══════════════════════════════════════════════════════════

// List all windows with titles
function listWindows() {
  const psScript = path.join(ROOT, 'tmp', '_list_windows.ps1');
  ensureDir(path.dirname(psScript));
  fs.writeFileSync(psScript, `Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object { "$($_.Id)|$($_.ProcessName)|$($_.MainWindowTitle)" }\n`);
  try {
    const raw = execSync(`powershell.exe -ExecutionPolicy Bypass -File "${psScript}"`, { encoding: 'utf8', timeout: 10000 });
    return raw.trim().split('\n').filter(l => l.includes('|')).map(line => {
      const [pid, name, title] = line.trim().split('|');
      return {
        pid: parseInt(pid),
        process: name,
        title: title,
        glyph: codex.hilbertAddress(`window:${pid}:${name}`),
        cube: { D15: 103823, D13: 68921, D16: parseInt(pid) },
      };
    });
  } catch (e) {
    return [{ error: e.message.slice(0, 100) }];
  }
}

// Capture a specific window by PID (works even if window is behind others)
function captureWindowByPid(pid, label) {
  ensureDir(CAPTURES_DIR);
  const ts = now().replace(/[:.]/g, '');
  const safeLabel = (label || `pid-${pid}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const file = path.join(CAPTURES_DIR, `${safeLabel}-${ts}.png`);

  // PowerShell: get window handle by PID, capture just that window's rect
  const psScript = path.join(ROOT, 'tmp', '_capture_window.ps1');
  ensureDir(path.dirname(psScript));
  const outFile = file.replace(/\//g, '\\');
  fs.writeFileSync(psScript, `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCapture {
  [DllImport("user32.dll")] public static extern IntPtr GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hDC, uint nFlags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if (-not $proc -or $proc.MainWindowHandle -eq [IntPtr]::Zero) { Write-Error "No window for PID ${pid}"; exit 1 }
$hwnd = $proc.MainWindowHandle
$rect = New-Object WinCapture+RECT
[WinCapture]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) { Write-Error "Window has zero size"; exit 1 }
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $gfx.GetHdc()
[WinCapture]::PrintWindow($hwnd, $hdc, 2) | Out-Null
$gfx.ReleaseHdc($hdc)
$bmp.Save("${outFile}")
$gfx.Dispose()
$bmp.Dispose()
Write-Output "OK"
`);

  try {
    const result = execSync(`powershell.exe -ExecutionPolicy Bypass -File "${psScript}"`, {
      encoding: 'utf8', timeout: 15000
    }).trim();

    if (fs.existsSync(file) && fs.statSync(file).size > 100) {
      gcCaptures();
      return { ok: true, file, bytes: fs.statSync(file).size, pid, label: safeLabel };
    }
    return { ok: false, error: 'file not created or empty', raw: result };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
}

// Capture window by title match (partial, case-insensitive)
function captureWindowByTitle(titleMatch) {
  const windows = listWindows();
  const q = titleMatch.toLowerCase();
  // Match on title OR process name
  const match = windows.find(w => !w.error && (
    (w.title && w.title.toLowerCase().includes(q)) ||
    (w.process && w.process.toLowerCase().includes(q))
  ));
  if (!match || match.error) {
    return { ok: false, error: `No window matching "${titleMatch}"` };
  }
  return captureWindowByPid(match.pid, match.process + '-' + titleMatch.slice(0, 15));
}

// Capture specific screen by index
function captureScreen(screenIndex) {
  ensureDir(CAPTURES_DIR);
  const ts = now().replace(/[:.]/g, '');
  const file = path.join(CAPTURES_DIR, `screen-${screenIndex}-${ts}.png`);

  const psScript = path.join(ROOT, 'tmp', '_capture_screen.ps1');
  ensureDir(path.dirname(psScript));
  const outFile = file.replace(/\//g, '\\');
  fs.writeFileSync(psScript, `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screens = [System.Windows.Forms.Screen]::AllScreens
if (${screenIndex} -ge $screens.Length) { Write-Error "Screen ${screenIndex} not found"; exit 1 }
$scr = $screens[${screenIndex}]
$bounds = $scr.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bmp.Size)
$bmp.Save("${outFile}")
$gfx.Dispose()
$bmp.Dispose()
`);

  try {
    execSync(`powershell.exe -ExecutionPolicy Bypass -File "${psScript}"`, {
      encoding: 'utf8', timeout: 15000
    });

    if (fs.existsSync(file) && fs.statSync(file).size > 100) {
      gcCaptures();
      return { ok: true, file, bytes: fs.statSync(file).size, screen: screenIndex };
    }
    return { ok: false, error: 'file not created' };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
}

// Full desktop capture (legacy)
function captureFullDesktop() {
  ensureDir(CAPTURES_DIR);
  const ts = now().replace(/[:.]/g, '');
  const file = path.join(CAPTURES_DIR, `full-desktop-${ts}.png`);

  const psScript = path.join(ROOT, 'tmp', '_capture_full.ps1');
  ensureDir(path.dirname(psScript));
  const outFile = file.replace(/\//g, '\\');
  fs.writeFileSync(psScript, `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
$bmp.Save("${outFile}")
$gfx.Dispose()
$bmp.Dispose()
`);

  try {
    execSync(`powershell.exe -ExecutionPolicy Bypass -File "${psScript}"`, {
      encoding: 'utf8', timeout: 15000
    });
    if (fs.existsSync(file) && fs.statSync(file).size > 100) {
      gcCaptures();
      return { ok: true, file, bytes: fs.statSync(file).size };
    }
    return { ok: false, error: 'file not created' };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
}

// GC old captures
function gcCaptures() {
  if (!fs.existsSync(CAPTURES_DIR)) return;
  const files = fs.readdirSync(CAPTURES_DIR).filter(f => f.endsWith('.png')).sort();
  if (files.length > MAX_CAPTURES) {
    for (const f of files.slice(0, files.length - MAX_CAPTURES)) {
      try { fs.unlinkSync(path.join(CAPTURES_DIR, f)); } catch (_) {}
    }
  }
}

// ═══════════════════════════════════════════════════════════
// BEHCS BUS INTEGRATION
// ═══════════════════════════════════════════════════════════

function fireBehcs(verb, payload) {
  return new Promise((resolve) => {
    const env = JSON.stringify({
      id: 'cap-' + crypto.randomBytes(4).toString('hex'),
      ts: now(),
      from: 'asolaria-window-capture',
      to: 'triad',
      mode: 'shadow',
      type: 'capture_event',
      payload: { verb, ...payload },
      cube: { D15_DEVICE: 103823, D13_SURFACE: 68921, D44_HEARTBEAT: 7189057 },
      hash: crypto.createHash('sha256').update(verb + JSON.stringify(payload)).digest('hex').slice(0, 16),
    });
    const req = http.request({
      hostname: '127.0.0.1', port: BEHCS_PORT, path: '/behcs/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(env) },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ ok: false }); });
    req.write(env);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════
// CAPTURE LOOP WITH HEARTBEAT
// ═══════════════════════════════════════════════════════════

async function captureLoop(target, intervalSec, maxCycles) {
  console.log(`[capture-loop] target="${target}" interval=${intervalSec}s max=${maxCycles}`);

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const startMs = Date.now();
    let result;

    if (target === 'full') {
      result = captureFullDesktop();
    } else if (target.match(/^\d+$/)) {
      result = captureScreen(parseInt(target));
    } else if (target.match(/^pid:/)) {
      result = captureWindowByPid(parseInt(target.slice(4)), 'pid-target');
    } else {
      result = captureWindowByTitle(target);
    }

    const elapsed = Date.now() - startMs;
    const glyph = codex.hilbertAddress(`capture:${target}:${cycle}:${now()}`);

    console.log(`  [${cycle}/${maxCycles}] ${result.ok ? 'OK' : 'FAIL'} ${result.bytes || 0}B ${elapsed}ms glyph=${glyph}`);

    // Fire to bus
    await fireBehcs('behcs.capture.window', {
      target,
      cycle,
      ok: result.ok,
      bytes: result.bytes || 0,
      elapsed_ms: elapsed,
      file: result.file || null,
      glyph,
      error: result.error || null,
    });

    if (cycle < maxCycles) {
      await new Promise(r => setTimeout(r, intervalSec * 1000));
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('');
    console.log('  CAPTURABLE WINDOWS (each has Hilbert glyph + cube address)');
    console.log('  ' + '─'.repeat(70));
    const windows = listWindows();
    for (const w of windows) {
      if (w.error) { console.log('  ERROR: ' + w.error); continue; }
      console.log(`  PID=${String(w.pid).padEnd(6)} ${(w.process || '?').padEnd(22)} glyph=${w.glyph}  "${w.title}"`);
    }
    console.log('');
    console.log(`  ${windows.length} windows. Each is a capture target with cube address.`);
    return;
  }

  // Parse target
  let target = null;
  if (args.includes('--window')) target = args[args.indexOf('--window') + 1];
  else if (args.includes('--window-pid')) target = 'pid:' + args[args.indexOf('--window-pid') + 1];
  else if (args.includes('--screen')) target = args[args.indexOf('--screen') + 1];
  else if (args.includes('--full')) target = 'full';

  if (!target) {
    console.error('Usage: --list | --window <title> | --window-pid <pid> | --screen <idx> | --full');
    console.error('  Add --loop <seconds> for repeating capture');
    process.exit(1);
  }

  // Single capture or loop
  const loopIdx = args.indexOf('--loop');
  if (loopIdx >= 0) {
    const interval = parseInt(args[loopIdx + 1] || '30');
    const maxCycles = parseInt(args[args.indexOf('--max') + 1] || '100');
    await captureLoop(target, interval, maxCycles);
  } else {
    let result;
    if (target === 'full') result = captureFullDesktop();
    else if (target.match(/^\d+$/)) result = captureScreen(parseInt(target));
    else if (target.match(/^pid:/)) result = captureWindowByPid(parseInt(target.slice(4)), 'target');
    else result = captureWindowByTitle(target);

    const glyph = codex.hilbertAddress(`capture:${target}:${now()}`);
    console.log(JSON.stringify({ ...result, glyph, cube: { D15: 103823, D13: 68921 } }, null, 2));

    await fireBehcs('behcs.capture.window', {
      target, ok: result.ok, bytes: result.bytes || 0,
      file: result.file || null, glyph, error: result.error || null,
    });
  }
}

if (require.main === module) main().catch(e => console.error('FATAL:', e.message));
module.exports = { listWindows, captureWindowByPid, captureWindowByTitle, captureScreen, captureFullDesktop };
