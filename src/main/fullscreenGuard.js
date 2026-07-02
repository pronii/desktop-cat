const { execFile } = require('node:child_process');
const { getForegroundProbeWorker } = require('./foregroundWorker');

const DEFAULT_FULLSCREEN_THRESHOLD = 0.97;
const DEFAULT_SUSPEND_HOLD_MS = 3000;

const foregroundProbeScript = String.raw`
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

  public class WindowRecord {
    public string hwnd;
    public string title;
    public string className;
    public string processName;
    public int left;
    public int top;
    public int right;
    public int bottom;
    public int monitorLeft;
    public int monitorTop;
    public int monitorRight;
    public int monitorBottom;
  }
}
"@

function Get-WindowRecord([IntPtr]$hwnd) {
  if ($hwnd -eq [IntPtr]::Zero) {
    return $null
  }

  $rect = New-Object DesktopCatForegroundProbe+RECT
  [DesktopCatForegroundProbe]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) {
    return $null
  }

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
  try {
    $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName
  } catch {
    $processName = ""
  }

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

$records = New-Object System.Collections.Generic.List[object]
$callback = [DesktopCatForegroundProbe+EnumWindowsProc]{
  param([IntPtr]$hwnd, [IntPtr]$lParam)

  if ([DesktopCatForegroundProbe]::IsWindowVisible($hwnd) -and
      -not [DesktopCatForegroundProbe]::IsIconic($hwnd)) {
    $record = Get-WindowRecord $hwnd
    if ($null -ne $record) {
      $records.Add($record) | Out-Null
    }
  }

  return $true
}
[DesktopCatForegroundProbe]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null

[PSCustomObject]@{
  foreground = Get-WindowRecord ([DesktopCatForegroundProbe]::GetForegroundWindow())
  windows = $records
} | ConvertTo-Json -Compress -Depth 4
`;

function calculateCoverage(windowBounds, displayBounds) {
  if (!windowBounds || !displayBounds) return 0;

  const intersectionLeft = Math.max(windowBounds.x, displayBounds.x);
  const intersectionTop = Math.max(windowBounds.y, displayBounds.y);
  const intersectionRight = Math.min(
    windowBounds.x + windowBounds.width,
    displayBounds.x + displayBounds.width
  );
  const intersectionBottom = Math.min(
    windowBounds.y + windowBounds.height,
    displayBounds.y + displayBounds.height
  );

  const intersectionWidth = Math.max(0, intersectionRight - intersectionLeft);
  const intersectionHeight = Math.max(0, intersectionBottom - intersectionTop);
  const displayArea = displayBounds.width * displayBounds.height;

  if (displayArea <= 0) return 0;
  return (intersectionWidth * intersectionHeight) / displayArea;
}

function isFullscreenForeground(
  foreground,
  display,
  threshold = DEFAULT_FULLSCREEN_THRESHOLD
) {
  return calculateCoverage(foreground, display) >= threshold;
}

function isIgnoredSystemWindow(windowSnapshot) {
  const className = windowSnapshot?.className || '';
  const processName = (windowSnapshot?.processName || '').toLowerCase();
  const title = windowSnapshot?.title || '';
  const ignoredClasses = new Set([
    'Progman',
    'WorkerW',
    'Shell_TrayWnd',
    'Shell_SecondaryTrayWnd',
    'Windows.UI.Core.CoreWindow',
    'DV2ControlHost',
    'MsgrIMEWindowClass'
  ]);
  const ignoredProcesses = new Set([
    'applicationframehost',
    'nvidia overlay',
    'shellexperiencehost',
    'startmenuexperiencehost',
    'searchhost',
    'textinputhost'
  ]);

  if (ignoredClasses.has(className)) return true;
  if (ignoredProcesses.has(processName)) return true;
  if (className === 'CEF-OSC-WIDGET' && title.includes('NVIDIA')) return true;
  if (processName === 'explorer' && title.trim() === '') return true;
  return false;
}

function shouldSuspendTopmost({
  foreground,
  windows,
  display,
  petWindowId,
  previousSuspend = false
}) {
  if (foreground) {
    if (petWindowId && String(foreground.hwnd) === String(petWindowId)) {
      return false;
    }
    if (isIgnoredSystemWindow(foreground)) {
      return false;
    }

    const foregroundDisplay = foreground.display || display;
    if (!foregroundDisplay) return previousSuspend;
    return isFullscreenForeground(foreground, foregroundDisplay);
  }

  if (Array.isArray(windows)) {
    return windows.some((windowSnapshot) => {
      if (petWindowId && String(windowSnapshot.hwnd) === String(petWindowId)) {
        return false;
      }
      if (isIgnoredSystemWindow(windowSnapshot)) {
        return false;
      }

      return isFullscreenForeground(
        windowSnapshot,
        windowSnapshot.display || display
      );
    });
  }

  return previousSuspend;
}

function createTopmostSuspendState() {
  return {
    suspendUntil: 0
  };
}

function resolveTopmostSuspend({
  state,
  detectedSuspend,
  now = Date.now(),
  holdMs = DEFAULT_SUSPEND_HOLD_MS
}) {
  if (detectedSuspend) {
    state.suspendUntil = now + Math.max(0, holdMs);
    return true;
  }

  return Number(state.suspendUntil) > now;
}

function normalizeWindowSnapshot(raw) {
  if (!raw || raw.hwnd === undefined) return null;

  return {
    hwnd: String(raw.hwnd),
    title: String(raw.title || ''),
    className: String(raw.className || ''),
    processName: String(raw.processName || ''),
    x: Number(raw.left),
    y: Number(raw.top),
    width: Number(raw.right) - Number(raw.left),
    height: Number(raw.bottom) - Number(raw.top)
  };
}

function normalizeDisplaySnapshot(raw) {
  if (!raw || raw.monitorLeft === undefined) return null;

  return {
    x: Number(raw.monitorLeft),
    y: Number(raw.monitorTop),
    width: Number(raw.monitorRight) - Number(raw.monitorLeft),
    height: Number(raw.monitorBottom) - Number(raw.monitorTop)
  };
}

function execFileAsync(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      if (stderr) {
        reject(new Error(stderr));
        return;
      }

      resolve(stdout);
    });
  });
}

function normalizeSnapshot(raw) {
  const foregroundRaw = raw?.foreground || raw;
  const windowRaws = Array.isArray(raw?.windows) ? raw.windows : [];

  return {
    foreground: normalizeWindowSnapshot(foregroundRaw),
    display: normalizeDisplaySnapshot(foregroundRaw),
    windows: windowRaws
      .map((windowRaw) => {
        const windowSnapshot = normalizeWindowSnapshot(windowRaw);
        const displaySnapshot = normalizeDisplaySnapshot(windowRaw);

        if (!windowSnapshot || !displaySnapshot) return null;
        return {
          ...windowSnapshot,
          display: displaySnapshot
        };
      })
      .filter(Boolean)
  };
}

async function probeForegroundWindow() {
  if (process.platform !== 'win32') {
    return null;
  }

  // 优先走常驻 PowerShell worker：省去每次轮询的进程启动 + Add-Type 编译开销
  const worker = getForegroundProbeWorker();
  if (!worker.broken) {
    try {
      const raw = await worker.probe();
      return normalizeSnapshot(raw);
    } catch (_err) {
      // worker 不可用或超时，回退到一次性 spawn
    }
  }

  const stdout = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', foregroundProbeScript],
    {
      windowsHide: true,
      timeout: 800,
      maxBuffer: 1024 * 64
    }
  );
  const raw = JSON.parse(stdout || '{}');
  return normalizeSnapshot(raw);
}

module.exports = {
  calculateCoverage,
  createTopmostSuspendState,
  isFullscreenForeground,
  isIgnoredSystemWindow,
  normalizeWindowSnapshot,
  normalizeDisplaySnapshot,
  probeForegroundWindow,
  resolveTopmostSuspend,
  shouldSuspendTopmost
};
