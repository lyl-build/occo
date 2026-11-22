param(
  [Parameter(Mandatory = $true)][ValidateSet('launch', 'input', 'capture', 'close')][string]$Action,
  [Parameter(Mandatory = $true)][string]$StateDir,
  [string]$TextBase64,
  [string]$Output,
  [string]$Profile = 'PowerShell'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class TerminalCapture {
  public delegate bool Callback(IntPtr window, IntPtr value);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Keyboard { public ushort Key, Scan; public uint Flags, Time; public UIntPtr Extra; }
  [StructLayout(LayoutKind.Sequential)] public struct Mouse { public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra; }
  [StructLayout(LayoutKind.Explicit)] public struct Payload { [FieldOffset(0)] public Keyboard Keyboard; [FieldOffset(0)] public Mouse Mouse; }
  [StructLayout(LayoutKind.Sequential)] public struct Input { public uint Type; public Payload Payload; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr value);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, Input[] inputs, int size);
  public static IntPtr[] Windows() {
    var found = new List<IntPtr>();
    EnumWindows((window, value) => {
      var name = new StringBuilder(256);
      GetClassName(window, name, name.Capacity);
      if (IsWindowVisible(window) && name.ToString().StartsWith("CASCADIA_HOSTING_WINDOW")) found.Add(window);
      return true;
    }, IntPtr.Zero);
    return found.ToArray();
  }
  public static string Title(IntPtr window) {
    var title = new StringBuilder(512);
    GetWindowText(window, title, title.Capacity);
    return title.ToString();
  }
  public static void Type(string text) {
    var inputs = new List<Input>();
    foreach (char character in text) {
      bool enter = character == '\r';
      var key = new Keyboard { Key = (ushort)(enter ? 13 : 0), Scan = (ushort)(enter ? 0 : character), Flags = enter ? 0u : 4u };
      inputs.Add(new Input { Type = 1, Payload = new Payload { Keyboard = key } });
      key.Flags |= 2;
      inputs.Add(new Input { Type = 1, Payload = new Payload { Keyboard = key } });
    }
    if (SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(Input))) != inputs.Count)
      throw new InvalidOperationException("Could not send input to the demonstration window.");
  }
}
'@

function Get-TerminalLayout([IntPtr]$Window) {
  $element = [System.Windows.Automation.AutomationElement]::FromHandle($Window)
  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'TermControl')
  $controls = @($element.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition) | Where-Object { -not $_.Current.IsOffscreen })
  if ($controls.Count -ne 1) { throw 'Use a Windows Terminal window with one visible pane.' }
  $control = $controls[0]
  $pattern = $control.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
  $visible = $pattern.GetVisibleRanges()
  if (-not $visible.Count) { throw 'The terminal has no visible text range.' }
  $character = $visible[0].Clone()
  $character.MoveEndpointByRange([System.Windows.Automation.Text.TextPatternRangeEndpoint]::End, $character, [System.Windows.Automation.Text.TextPatternRangeEndpoint]::Start)
  [void]$character.MoveEndpointByUnit([System.Windows.Automation.Text.TextPatternRangeEndpoint]::End, [System.Windows.Automation.Text.TextUnit]::Character, 1)
  $cell = $character.GetBoundingRectangles()[0]
  $bounds = $control.Current.BoundingRectangle
  return [pscustomobject]@{
    Handle = $Window.ToInt64(); DPI = [TerminalCapture]::GetDpiForWindow($Window)
    Font = $pattern.DocumentRange.GetAttributeValue([System.Windows.Automation.TextPattern]::FontNameAttribute).ToString()
    CellWidth = $cell.Width; CellHeight = $cell.Height
    X = $bounds.X; Y = $bounds.Y; Width = $bounds.Width; Height = $bounds.Height
  }
}

function Assert-MatchingLayout($Expected, $Actual) {
  foreach ($property in @('Width', 'Height', 'DPI', 'Font', 'CellWidth', 'CellHeight')) {
    if ($Expected.$property -ne $Actual.$property) {
      throw "Terminal $property differs: expected $($Expected.$property), got $($Actual.$property)."
    }
  }
}

$previous = [TerminalCapture]::SetThreadDpiAwarenessContext([IntPtr](-4))
try {
  $stateFile = Join-Path $StateDir 'window.json'
  if ($Action -eq 'launch') {
    $existing = @([TerminalCapture]::Windows())
    $token = 'occo README ' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    $launcher = @'
$ErrorActionPreference = 'Stop'
$runtime = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($item in $runtime.environment.psobject.Properties) { [Environment]::SetEnvironmentVariable($item.Name, [string]$item.Value, 'Process') }
$env:OPENCODE_CLI_CONFIG_CONTENT = $null
$env:OPENCODE_CONFIG_CONTENT = $null
Set-Location -LiteralPath $runtime.directory
& $runtime.executable --standalone
exit $LASTEXITCODE
'@
    $launcherPath = Join-Path $StateDir 'launch.ps1'
    Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding UTF8
    $arguments = @('-w', 'new', 'new-tab', '-p', ('"' + $Profile + '"'), '--title', ('"' + $token + '"'), '--suppressApplicationTitle', 'pwsh.exe', '-NoProfile', '-File', ('"' + $launcherPath + '"'))
    # The capture needs a real, visible terminal. It never targets an existing session.
    Start-Process -FilePath 'wt.exe' -ArgumentList $arguments -WindowStyle Normal | Out-Null
    $created = @()
    for ($attempt = 0; $attempt -lt 100 -and -not $created.Count; $attempt++) {
      Start-Sleep -Milliseconds 100
      $created = @([TerminalCapture]::Windows() | Where-Object { $_ -notin $existing -and [TerminalCapture]::Title($_).Contains($token) })
    }
    if ($created.Count -ne 1) { throw 'Could not identify the new demonstration window.' }
    $window = $created[0]
    @{ Handle = $window.ToInt64(); Token = $token } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
    [void][TerminalCapture]::SetForegroundWindow($window)
    Start-Sleep -Seconds 2
    $capture = Get-TerminalLayout $window
    @{ Handle = $window.ToInt64(); Token = $token; Capture = $capture } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $stateFile -Encoding UTF8
    Write-Output "Default terminal: $($capture.Width)x$($capture.Height), DPI $($capture.DPI), $($capture.Font), cells $($capture.CellWidth)x$($capture.CellHeight)."
    exit 0
  }

  $state = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $window = [IntPtr]$state.Handle
  if (-not [TerminalCapture]::IsWindow($window)) {
    if ($Action -eq 'close') { exit 0 }
    throw 'The demonstration window is closed.'
  }
  if (-not [TerminalCapture]::Title($window).Contains($state.Token)) { throw 'Window identity changed.' }
  if ($Action -eq 'close') {
    [void][TerminalCapture]::PostMessage($window, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)
    exit 0
  }
  [void][TerminalCapture]::SetForegroundWindow($window)
  Start-Sleep -Milliseconds 250
  if ([TerminalCapture]::GetForegroundWindow() -ne $window) { throw 'The demonstration window must be in the foreground.' }
  $actual = Get-TerminalLayout $window
  Assert-MatchingLayout $state.Capture $actual
  if ($Action -eq 'input') {
    [TerminalCapture]::Type([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextBase64)))
    exit 0
  }
  $rect = New-Object TerminalCapture+Rect
  [void][TerminalCapture]::GetWindowRect($window, [ref]$rect)
  $bitmap = [Drawing.Bitmap]::new($rect.Right - $rect.Left, $rect.Bottom - $rect.Top)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $dc = $graphics.GetHdc()
    try {
      # PW_RENDERFULLCONTENT captures this window even when its bottom is behind the taskbar.
      if (-not [TerminalCapture]::PrintWindow($window, $dc, 2)) { throw 'Could not capture the demonstration window.' }
    } finally { $graphics.ReleaseHdc($dc) }
    # Keep the complete terminal content area; remove only native window chrome.
    $content = $bitmap.Clone([Drawing.Rectangle]::new(
      [int]($actual.X - $rect.Left), [int]($actual.Y - $rect.Top),
      [int]$actual.Width, [int]$actual.Height), [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $content.SetResolution($actual.DPI, $actual.DPI)
      $content.Save($Output, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $content.Dispose() }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
  $actual | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($Output + '.layout.json') -Encoding UTF8
} finally {
  [void][TerminalCapture]::SetThreadDpiAwarenessContext($previous)
}
