const { spawn } = require('node:child_process');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const RESULT_MARKER = '__DC_PROBE_RESULT__';
const ERROR_MARKER = '__DC_ERROR__';
const PROBE_TIMEOUT_MS = 3000;
const MAX_RESTART_ATTEMPTS = 4;

// PowerShell 常驻 worker 脚本：启动时 Add-Type 编译一次 C#，之后循环读取
// stdin 指令（PROBE / EXIT），每次 PROBE 输出单行 JSON 到 stdout。
// 相比每次轮询都 spawn 新 powershell + 重新编译 C#，可省去 ~300-700ms/次。
const workerScript = String.raw`
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { [Console]::InputEncoding = [System.Text.Encoding]::UTF8 } catch {}

try {
  Add-Type @"
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;

public class DesktopCatForegroundProbe {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct MONITORINFO {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public int dwFlags;
  }
}
"@
} catch {
  [Console]::Out.WriteLine("${ERROR_MARKER}" + $_.Exception.Message)
  [Console]::Out.Flush()
  exit 1
}

function Get-WindowRecord([IntPtr]$hwnd) {
  if ($hwnd -eq [IntPtr]::Zero) { return $null }

  $rect = New-Object DesktopCatForegroundProbe+RECT
  [DesktopCatForegroundProbe]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) { return $null }

  $monitor = [DesktopCatForegroundProbe]::MonitorFromWindow($hwnd, 2)
  $info = New-Object DesktopCatForegroundProbe+MONITORINFO
  $info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
  [DesktopCatForegroundProbe]::GetMonitorInfo($monitor, [ref]$info) | Out-Null

  $titleBuilder = New-Object System.Text.StringBuilder 512
  [DesktopCatForegroundProbe]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null

  $classBuilder = New-Object System.Text.StringBuilder 256
  [DesktopCatForegroundProbe]::GetClassName($hwnd, $classBuilder, $classBuilder.Capacity) | Out-Null

  $processId = 0
  [DesktopCatForegroundProbe]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
  $processName = ""
  try { $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName } catch { $processName = "" }

  [PSCustomObject]@{
    hwnd = $hwnd.ToInt64().ToString()
    title = $titleBuilder.ToString()
    className = $classBuilder.ToString()
    processName = $processName
    left = $rect.Left
    top = $rect.Top
    right = $rect.Right
    bottom = $rect.Bottom
    monitorLeft = $info.rcMonitor.Left
    monitorTop = $info.rcMonitor.Top
    monitorRight = $info.rcMonitor.Right
    monitorBottom = $info.rcMonitor.Bottom
  }
}

function Invoke-Probe {
  $records = New-Object System.Collections.Generic.List[object]
  $callback = [DesktopCatForegroundProbe+EnumWindowsProc]{
    param([IntPtr]$hwnd, [IntPtr]$lParam)
    if ([DesktopCatForegroundProbe]::IsWindowVisible($hwnd) -and
        -not [DesktopCatForegroundProbe]::IsIconic($hwnd)) {
      $record = Get-WindowRecord $hwnd
      if ($null -ne $record) { $records.Add($record) | Out-Null }
    }
    return $true
  }
  [DesktopCatForegroundProbe]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null

  [PSCustomObject]@{
    foreground = Get-WindowRecord ([DesktopCatForegroundProbe]::GetForegroundWindow())
    windows = $records
  } | ConvertTo-Json -Compress -Depth 4
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $cmd = $line.Trim()
  if ($cmd -eq 'PROBE') {
    try {
      $json = Invoke-Probe
      [Console]::Out.WriteLine("${RESULT_MARKER}" + $json)
      [Console]::Out.Flush()
    } catch {
      [Console]::Out.WriteLine("${ERROR_MARKER}" + $_.Exception.Message)
      [Console]::Out.Flush()
    }
  } elseif ($cmd -eq 'EXIT') {
    break
  }
}
`;

class ForegroundProbeWorker {
  constructor() {
    this.proc = null;
    this.pending = null;
    this.buffer = '';
    this.restartAttempts = 0;
    this.broken = false;
    this.scriptPath = null;
  }

  start() {
    if (this.proc || this.broken) return true;

    let scriptPath;
    try {
      const dir = os.tmpdir();
      scriptPath = path.join(dir, 'desktop-cat-foreground-probe.ps1');
      fs.writeFileSync(scriptPath, workerScript, 'utf-8');
      this.scriptPath = scriptPath;
    } catch (_e) {
      this.broken = true;
      return false;
    }

    let proc;
    try {
      proc = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath
      ], {
        windowsHide: true,
        env: { ...process.env, POWERSHELL_TELEMETRY_OPTOUT: '1' }
      });
    } catch (_e) {
      this.broken = true;
      return false;
    }

    this.proc = proc;
    this.buffer = '';

    proc.stdout.setEncoding('utf-8');
    proc.stdout.on('data', (chunk) => this._onData(chunk));
    proc.stderr.on('data', () => { /* ignore stderr noise */ });
    proc.on('error', () => this._handleExit());
    proc.on('exit', () => this._handleExit());

    return true;
  }

  _onData(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, '');
      this.buffer = this.buffer.slice(idx + 1);
      this._handleLine(line);
    }
  }

  _handleLine(line) {
    if (line.startsWith(RESULT_MARKER)) {
      if (!this.pending) return;
      const json = line.slice(RESULT_MARKER.length);
      clearTimeout(this.pending.timer);
      const { resolve, reject } = this.pending;
      this.pending = null;
      try {
        resolve(JSON.parse(json || '{}'));
      } catch (err) {
        reject(err);
      }
      return;
    }

    if (line.startsWith(ERROR_MARKER)) {
      // Worker reported a compile or runtime error. Mark broken so callers
      // fall back to the one-shot spawn path.
      this.broken = true;
      if (this.pending) {
        clearTimeout(this.pending.timer);
        this.pending.reject(new Error('worker error: ' + line.slice(ERROR_MARKER.length)));
        this.pending = null;
      }
    }
  }

  _handleExit() {
    this.proc = null;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('worker exited unexpectedly'));
      this.pending = null;
    }
  }

  probe() {
    if (this.broken) {
      return Promise.reject(new Error('worker broken'));
    }
    if (!this.proc) {
      if (!this.start()) {
        return Promise.reject(new Error('worker unavailable'));
      }
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending) {
          this.pending.reject(new Error('probe timeout'));
          this.pending = null;
        }
        this._restart();
      }, PROBE_TIMEOUT_MS);

      this.pending = { resolve, reject, timer };

      try {
        this.proc.stdin.write('PROBE\n');
      } catch (err) {
        clearTimeout(timer);
        this.pending = null;
        reject(err);
        this._restart();
      }
    });
  }

  _restart() {
    this._killProc();
    this.restartAttempts += 1;
    if (this.restartAttempts <= MAX_RESTART_ATTEMPTS && !this.broken) {
      this.start();
    } else {
      this.broken = true;
    }
  }

  _killProc() {
    const proc = this.proc;
    if (!proc) return;
    this.proc = null;
    try { proc.stdin.end('EXIT\n'); } catch (_e) { /* ignore */ }
    setTimeout(() => {
      try { proc.kill(); } catch (_e) { /* already gone */ }
    }, 200);
  }

  stop() {
    this._killProc();
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending = null;
    }
    // Leave the .ps1 file in tmpdir; OS will clean it up. Avoid extra I/O on quit.
    this.scriptPath = null;
  }

  isAvailable() {
    return !this.broken && !!this.proc;
  }
}

const worker = new ForegroundProbeWorker();

module.exports = {
  ForegroundProbeWorker,
  getForegroundProbeWorker: () => worker
};
