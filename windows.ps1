# windows.ps1 - Native Windows bridge for the typing bot.
# Provides: screen/window capture, real virtual-key injection, window focus.
# All output is emitted as a single JSON object on the last line so Node can parse it.
# NOTE: ASCII-only content on purpose (avoids PS 5.1 codepage issues).

param(
    [Parameter(Position = 0)]
    [ValidateSet('list-windows', 'capture', 'type', 'key', 'focus', 'render', 'pick-region', 'input-probe', 'serve')]
    [string]$Command = 'list-windows',

    [string]$Out,
    [string]$Window,
    [int]$Handle = 0,
    [int]$X = 0,
    [int]$Y = 0,
    [int]$W = 0,
    [int]$H = 0,
    [int]$Scale = 2,
    [string]$Text = '',
    [string]$TextFile = '',
    [int]$KeyDelay = 10,
    [int]$CharDelay = 0,
    [int]$Jitter = 0,
    [int]$LeadMs = 0,
    [string]$Combo = '',
    [string]$FontName = 'Consolas',
    [int]$FontSize = 28,
    [switch]$NoAntialias,
    [switch]$Invert
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- native layer
if (-not ('NativeBridge.Win32' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace NativeBridge
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint Type;
        public InputUnion Data;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx, dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT {
        public uint uMsg; public ushort wParamL, wParamH;
    }

    public enum WindowState { Exists = 0, Minimized = 1, Hidden = 2 }

    public static class Win32
    {
        const uint INPUT_KEYBOARD = 1;
        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_UNICODE = 0x0004;
        const uint KEYEVENTF_SCANCODE = 0x0008;

        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
        [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
        // Windows' default timer resolution is ~15.6 ms, so Thread.Sleep(2) really
        // sleeps ~15 ms and fast typing gets dragged down to a crawl.
        [DllImport("winmm.dll")] public static extern uint timeBeginPeriod(uint uPeriod);
        [DllImport("winmm.dll")] public static extern uint timeEndPeriod(uint uPeriod);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
        [DllImport("user32.dll")] public static extern short VkKeyScan(char ch);
        [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint uCode, uint uMapType);
        [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint idThread);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
        [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int cx, int cy);
        [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr h);
        [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr h);
        [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
        [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);
        [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder buf, int nMaxCount);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetClassNameW(IntPtr hWnd, StringBuilder buf, int nMaxCount);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

        public static string GetTitle(IntPtr hWnd) {
            StringBuilder sb = new StringBuilder(512);
            GetWindowTextW(hWnd, sb, sb.Capacity);
            return sb.ToString();
        }

        public static string GetClass(IntPtr hWnd) {
            StringBuilder sb = new StringBuilder(512);
            GetClassNameW(hWnd, sb, sb.Capacity);
            return sb.ToString();
        }

        public static List<IntPtr> FindWindows(string needle) {
            List<IntPtr> found = new List<IntPtr>();
            EnumWindows(delegate (IntPtr hWnd, IntPtr lParam) {
                if (!IsWindowVisible(hWnd)) return true;
                uint pid = 0; GetWindowThreadProcessId(hWnd, out pid);
                string title = GetTitle(hWnd);
                if (title.Length == 0) return true;
                if (needle.Length == 0 || title.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0) {
                    found.Add(hWnd);
                }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        // Records why the most recent SendInput failed. SendInput returns 0 and
        // does *not* throw, so callers must check it -- otherwise you get a
        // cheerful "sent 17 keystrokes" while nothing actually reached the OS.
        public static int LastInputError = 0;
        public static int InputSize() { return Marshal.SizeOf(typeof(INPUT)); }

        public static uint SendKey(ushort vk, bool down, bool extended) {
            INPUT input = new INPUT();
            input.Type = INPUT_KEYBOARD;
            input.Data.ki = new KEYBDINPUT();
            input.Data.ki.wVk = vk;
            input.Data.ki.wScan = 0;
            if (extended) input.Data.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
            if (!down) input.Data.ki.dwFlags |= KEYEVENTF_KEYUP;
            uint accepted = SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
            if (accepted == 0) { LastInputError = Marshal.GetLastWin32Error(); }
            return accepted;
        }

        public static uint SendScan(ushort scan, bool down) {
            INPUT input = new INPUT();
            input.Type = INPUT_KEYBOARD;
            input.Data.ki = new KEYBDINPUT();
            input.Data.ki.wVk = 0;
            input.Data.ki.wScan = scan;
            input.Data.ki.dwFlags = KEYEVENTF_SCANCODE;
            if (!down) input.Data.ki.dwFlags |= KEYEVENTF_KEYUP;
            uint accepted = SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
            if (accepted == 0) { LastInputError = Marshal.GetLastWin32Error(); }
            return accepted;
        }

        public static void Sleep(int ms) { if (ms > 0) System.Threading.Thread.Sleep(ms); }
    }
}
'@
}

[void][NativeBridge.Win32]::SetProcessDPIAware()
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')

# Records the error payload and throws. It must NOT exit: in serve mode one bad
# command would otherwise kill the long-lived host and every later request.
function Fail([string]$msg, [hashtable]$extra) {
    $o = @{ ok = $false; error = $msg }
    if ($extra) { foreach ($k in $extra.Keys) { $o[$k] = $extra[$k] } }
    $script:lastFail = ($o | ConvertTo-Json -Compress)
    throw [System.Exception]::new($msg)
}

# Sleeps while still pumping window messages. Blocking the UI thread with a plain
# Thread.Sleep inside a Form event leaves synthetic keystrokes sitting unprocessed
# in the queue, which makes working code look broken.
function Wait-Pump {
    param([int]$Ms)
    if ($Ms -le 0) { return }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt $Ms) {
        [System.Windows.Forms.Application]::DoEvents()
        [System.Threading.Thread]::Sleep(4)
    }
}

# Attempt a direct window render. Returns [System.Drawing.Bitmap] or $null.
function Invoke-PrintWindow([IntPtr]$hwnd) {
    $rect = New-Object NativeBridge.RECT
    [void][NativeBridge.Win32]::GetWindowRect($hwnd, [ref]$rect)
    $w = $rect.Right - $rect.Left
    $h = $rect.Bottom - $rect.Top
    # Some window classes report degenerate rects; fall back to screen copy then.
    if ($w -lt 8 -or $h -lt 8) { return $null }

    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $hdc = $g.GetHdc()
    $ok = $false
    # PW_RENDERFULLCONTENT works for most modern (including GPU-composited) windows.
    foreach ($flag in @(0x00000002, 0x00000000)) {
        $ok = [NativeBridge.Win32]::PrintWindow($hwnd, $hdc, $flag)
        if ($ok) { break }
    }
    $g.ReleaseHdc($hdc)
    $g.Dispose()
    if (-not $ok) { $bmp.Dispose(); return $null }

    # Heuristic: reject all-black frames (happens with certain rendering paths).
    if (Test-BlankBitmap $bmp) { $bmp.Dispose(); return $null }
    return $bmp
}

function Test-BlankBitmap([System.Drawing.Bitmap]$bmp) {
    $stepX = [Math]::Max(1, [int]($bmp.Width / 24))
    $stepY = [Math]::Max(1, [int]($bmp.Height / 24))
    $seen = @{}
    for ($y = 0; $y -lt $bmp.Height; $y += $stepY) {
        for ($x = 0; $x -lt $bmp.Width; $x += $stepX) {
            $c = $bmp.GetPixel($x, $y)
            $key = "{0}-{1}-{2}" -f ($c.R -shr 4), ($c.G -shr 4), ($c.B -shr 4)
            $seen[$key] = $true
            if ($seen.Count -gt 3) { return $false }
        }
    }
    return $true
}

# Inverts a bitmap. Tesseract is trained on dark text over a light background;
# games usually show light text over a dark background, so flipping it raises
# the recognition rate noticeably on those.
function Invoke-InvertBitmap([System.Drawing.Bitmap]$bmp) {
    $m = New-Object System.Drawing.Imaging.ColorMatrix
    $m.Matrix00 = -1; $m.Matrix11 = -1; $m.Matrix22 = -1
    $m.Matrix33 = 1; $m.Matrix44 = 1
    $m.Matrix40 = 1; $m.Matrix41 = 1; $m.Matrix42 = 1
    $attr = New-Object System.Drawing.Imaging.ImageAttributes
    $attr.SetColorMatrix($m)
    $out = New-Object System.Drawing.Bitmap($bmp.Width, $bmp.Height)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $rect = New-Object System.Drawing.Rectangle(0, 0, $bmp.Width, $bmp.Height)
    $g.DrawImage($bmp, $rect, 0, 0, $bmp.Width, $bmp.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
    $g.Dispose(); $attr.Dispose()
    $bmp.Dispose()
    return $out
}

# --------------------------------------------------------------- command impl
# One dispatcher, two entry points: single-shot CLI (below) and the long-lived
# serve loop. Arguments come in as a hashtable so the same body can be reused;
# values are assigned to locals so the original body finds them unchanged.
function Invoke-TbCommand {
    param([hashtable]$P)

    $Command = [string]$P['Command']
    $Out = [string]$P['Out']
    $Window = [string]$P['Window']
    $Handle = [int]$P['Handle']
    $X = [int]$P['X']
    $Y = [int]$P['Y']
    $W = [int]$P['W']
    $H = [int]$P['H']
    $Scale = [int]$P['Scale']
    $Text = [string]$P['Text']
    $TextFile = [string]$P['TextFile']
    $KeyDelay = [int]$P['KeyDelay']
    $CharDelay = [int]$P['CharDelay']
    $Jitter = [int]$P['Jitter']
    $LeadMs = [int]$P['LeadMs']
    $Combo = [string]$P['Combo']
    $FontName = [string]$P['FontName']
    $FontSize = [int]$P['FontSize']
    $NoAntialias = [bool]$P['NoAntialias']
    $Invert = [bool]$P['Invert']

switch ($Command) {

    'list-windows' {
        $list = @()
        [NativeBridge.Win32]::FindWindows('') | ForEach-Object {
            $hwnd = $_
            $rect = New-Object NativeBridge.RECT
            [void][NativeBridge.Win32]::GetWindowRect($hwnd, [ref]$rect)
            $procId = 0
            [void][NativeBridge.Win32]::GetWindowThreadProcessId($hwnd, [ref]$procId)
            $title = [NativeBridge.Win32]::GetTitle($hwnd)
            if ($title.Length -gt 0) {
                $list += [pscustomobject]@{
                    handle = $hwnd.ToInt64()
                    pid    = $procId
                    title  = $title
                    cls    = [NativeBridge.Win32]::GetClass($hwnd)
                    rect   = @{
                        x = $rect.Left; y = $rect.Top
                        w = $rect.Right - $rect.Left
                        h = $rect.Bottom - $rect.Top
                    }
                }
            }
        }
        Write-Output (@{ ok = $true; windows = $list } | ConvertTo-Json -Compress -Depth 6)
    }

    'focus' {
        $hwnd = [IntPtr]::Zero
        if ($Handle -ne 0) { $hwnd = [IntPtr]$Handle }
        elseif ($Window.Length -gt 0) {
            $found = [NativeBridge.Win32]::FindWindows($Window)
            if ($found.Count -eq 0) { Fail "window not found: $Window" }
            $hwnd = $found[0]
        }
        if ($hwnd -eq [IntPtr]::Zero) { Fail 'no window specified' }

        if ([NativeBridge.Win32]::IsIconic($hwnd)) {
            [void][NativeBridge.Win32]::ShowWindow($hwnd, 9)   # SW_RESTORE
        }
        [void][NativeBridge.Win32]::SetForegroundWindow($hwnd)
        if ($LeadMs -gt 0) { Start-Sleep -Milliseconds $LeadMs }
        Start-Sleep -Milliseconds 150
        # Report whether the foreground actually moved: Windows' foreground
        # lock can silently veto SetForegroundWindow, and the caller needs
        # to know (otherwise capture/typing lands on the wrong window).
        $isFg = ([NativeBridge.Win32]::GetForegroundWindow() -eq $hwnd)
        Write-Output (@{ ok = $true; handle = $hwnd.ToInt64(); foreground = $isFg } | ConvertTo-Json -Compress)
    }

    'capture' {
        $bmp = $null
        $source = ''

        if ($Handle -ne 0 -or $Window.Length -gt 0) {
            $hwnd = [IntPtr]::Zero
            if ($Handle -ne 0) { $hwnd = [IntPtr]$Handle }
            else {
                $found = [NativeBridge.Win32]::FindWindows($Window)
                if ($found.Count -eq 0) { Fail "window not found: $Window" }
                $hwnd = $found[0]
            }
            $bmp = Invoke-PrintWindow $hwnd
            if ($bmp) {
                $source = 'printwindow'
                if ($W -gt 0 -and $H -gt 0) {
                    $rect = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
                    $cropped = $bmp.Clone($rect, $bmp.PixelFormat)
                    $bmp.Dispose(); $bmp = $cropped
                    $source = 'printwindow+crop'
                }
            }
            else {
                $rect = New-Object NativeBridge.RECT
                [void][NativeBridge.Win32]::GetWindowRect($hwnd, [ref]$rect)
                $X = $rect.Left; $Y = $rect.Top
                $W = $rect.Right - $rect.Left
                $H = $rect.Bottom - $rect.Top
            }
        }

        if (-not $bmp) {
            if ($W -le 0 -or $H -le 0) {
                $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
                $X = $screen.X; $Y = $screen.Y; $W = $screen.Width; $H = $screen.Height
            }
            $bmp = New-Object System.Drawing.Bitmap($W, $H)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.CopyFromScreen($X, $Y, 0, 0, $bmp.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
            $g.Dispose()
            $source = 'screencopy'
        }

        # Upscale before OCR: tesseract is far more reliable on large glyphs.
        if ($Scale -gt 1) {
            $sw = $bmp.Width * $Scale
            $sh = $bmp.Height * $Scale
            $scaled = New-Object System.Drawing.Bitmap($sw, $sh)
            $g = [System.Drawing.Graphics]::FromImage($scaled)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.DrawImage($bmp, 0, 0, $sw, $sh)
            $g.Dispose()
            $bmp.Dispose(); $bmp = $scaled
        }

        if (-not $Out) { $Out = Join-Path $env:TEMP 'typingbot-capture.png' }
        if ($Invert) { $bmp = Invoke-InvertBitmap $bmp }
        $dir = Split-Path -Parent $Out
        if ($dir -and -not (Test-Path $dir)) { [void](New-Item -ItemType Directory -Path $dir -Force) }
        $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
        $w = $bmp.Width; $h = $bmp.Height
        $bmp.Dispose()

        Write-Output (@{ ok = $true; path = $Out; width = $w; height = $h; source = $source } | ConvertTo-Json -Compress)
    }

    'pick-region' {
        # Full-screen overlay: drag to select the rectangle containing your game's
        # text line. Returns physical pixels, which is exactly what CopyFromScreen expects.
        $form = New-Object System.Windows.Forms.Form
        $form.WindowState = [System.Windows.Forms.FormWindowState]::Maximized
        $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
        $form.TopMost = $true
        $form.Opacity = 0.45
        $form.BackColor = [System.Drawing.Color]::Black
        $form.Cursor = [System.Windows.Forms.Cursors]::Cross
        $form.KeyPreview = $true

        $dbProp = [System.Windows.Forms.Form].GetProperty('DoubleBuffered',
            [System.Reflection.BindingFlags]'NonPublic,Instance')
        if ($dbProp) { $dbProp.SetValue($form, $true, $null) }

        $state = @{ start = $null; finish = $null }
        $hintFont = New-Object System.Drawing.Font('Segoe UI', 16)
        $frameFont = New-Object System.Drawing.Font('Segoe UI', 12)
        $labelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

        $form.Add_MouseDown({
                param($s, $e)
                if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
                    $state.start = $e.Location
                    $state.finish = $e.Location
                    $form.Invalidate()
                }
            })
        $form.Add_MouseMove({
                param($s, $e)
                if ($state.start) { $state.finish = $e.Location; $form.Invalidate() }
            })
        $form.Add_MouseUp({
                param($s, $e)
                if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
                    $state.finish = $e.Location
                    $form.Close()
                }
            })
        $form.Add_KeyDown({
                param($s, $e)
                if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
                    $state.start = $null
                    $form.Close()
                }
            })
        $form.Add_Paint({
                param($s, $e)
                if ($state.start) {
                    $rx = [Math]::Min($state.start.X, $state.finish.X)
                    $ry = [Math]::Min($state.start.Y, $state.finish.Y)
                    $rw = [Math]::Abs($state.finish.X - $state.start.X)
                    $rh = [Math]::Abs($state.finish.Y - $state.start.Y)

                    $clear = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, 0, 0, 0))
                    $e.Graphics.FillRectangle($clear, $rx, $ry, $rw, $rh)
                    $clear.Dispose()

                    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 0, 210, 255), 2)
                    $e.Graphics.DrawRectangle($pen, $rx, $ry, $rw, $rh)
                    $pen.Dispose()

                    $label = "$rw x $rh  at $rx,$ry"
                    $ly = if ($ry -gt 28) { $ry - 26 } else { $ry + 6 }
                    $e.Graphics.DrawString($label, $frameFont, $labelBrush, $rx + 4, $ly)
                }
                else {
                    $e.Graphics.DrawString('Drag to select the text area.  Esc to cancel.',
                        $hintFont, $labelBrush, 40, 40)
                }
            })

        [void]$form.ShowDialog()
        $form.Dispose()
        $hintFont.Dispose(); $frameFont.Dispose(); $labelBrush.Dispose()

        if (-not $state.start) { Fail 'region selection cancelled' }
        $x1 = [Math]::Min($state.start.X, $state.finish.X)
        $y1 = [Math]::Min($state.start.Y, $state.finish.Y)
        $w1 = [Math]::Abs($state.finish.X - $state.start.X)
        $h1 = [Math]::Abs($state.finish.Y - $state.start.Y)
        if ($w1 -lt 4 -or $h1 -lt 4) { Fail 'selection too small' }

        Write-Output (@{ ok = $true; region = @{ x = $x1; y = $y1; w = $w1; h = $h1 } } | ConvertTo-Json -Compress)
    }

    'type' {
        # Bring the target forward first, then honour the lead-in delay so there
        # is still a window to bail out if the recognised text looks wrong.
        if ($Window.Length -gt 0) {
            $fw = [NativeBridge.Win32]::FindWindows($Window)
            if ($fw.Count -eq 0) { Fail "window not found: $Window" }
            $target = $fw[0]
            if ([NativeBridge.Win32]::IsIconic($target)) {
                [void][NativeBridge.Win32]::ShowWindow($target, 9)
            }
            [void][NativeBridge.Win32]::SetForegroundWindow($target)
            Start-Sleep -Milliseconds 250
        }

        if ($LeadMs -gt 0) { Start-Sleep -Milliseconds $LeadMs }

        # Preferred path: a JSON sequence file emitted by the Node scheduler.
        # Avoids CLI quoting issues and keeps all typing-rhythm logic in one place.
        if ($TextFile.Length -gt 0) {
            if (-not (Test-Path $TextFile)) { Fail "sequence file not found: $TextFile" }
            $rawSeq = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
            $seq = ($rawSeq | ConvertFrom-Json)
            $keyDelay = [int]$seq.keyDelay
            if ($keyDelay -lt 0) { $keyDelay = 10 }
            $sentSeq = 0
            $failedSeq = 0
            $swSeq = [System.Diagnostics.Stopwatch]::StartNew()
            foreach ($s in $seq.steps) {
                if ($s.pre -gt 0) { [NativeBridge.Win32]::Sleep([int]$s.pre) }
                $vk = [System.UInt16]$s.vk
                if ($vk -gt 0) {
                    $shift = [System.Boolean]$s.shift
                    if ($shift) {
                        if ([NativeBridge.Win32]::SendKey(0xA0, $true, $false) -eq 0) { $failedSeq++ }
                        [NativeBridge.Win32]::Sleep(2)
                    }
                    if ([NativeBridge.Win32]::SendKey($vk, $true, $false) -eq 0) { $failedSeq++ }
                    [NativeBridge.Win32]::Sleep($keyDelay)
                    if ([NativeBridge.Win32]::SendKey($vk, $false, $false) -eq 0) { $failedSeq++ }
                    if ($shift) {
                        [NativeBridge.Win32]::Sleep(2)
                        if ([NativeBridge.Win32]::SendKey(0xA0, $false, $false) -eq 0) { $failedSeq++ }
                    }
                    $sentSeq++
                }
                if ($s.post -gt 0) { [NativeBridge.Win32]::Sleep([int]$s.post) }
            }
            $swSeq.Stop()

            if ($failedSeq -gt 0) {
                $errCode = [NativeBridge.Win32]::LastInputError
                $msg = "SendInput rejected $failedSeq keystroke event(s), win32 error $errCode."
                if ($errCode -eq 87) {
                    $msg += ' This process is probably not attached to an interactive desktop (service/sandbox session). Run it from a normal desktop shell. Nothing was typed.'
                }
                elseif ($errCode -eq 5) {
                    $msg += ' Access denied.' +
                            ' Another process at a higher integrity level owns the foreground window. Run both with the same privilege level.'
                }
                Write-Output (@{ ok = $false; error = $msg; failed = $failedSeq; accepted = $sentSeq; win32 = $errCode; inputSize = [NativeBridge.Win32]::InputSize() } | ConvertTo-Json -Compress)
                return
            }

            Write-Output (@{ ok = $true; chars = $sentSeq; failed = 0; ms = $swSeq.ElapsedMilliseconds; mode = 'sequence' } | ConvertTo-Json -Compress)
            return
        }

        $rnd = New-Object System.Random
        $sent = 0

        # Map a character to its virtual key using the *current* keyboard layout,
        # falling back to a US-layout table when VkKeyScan reports no mapping.
        $script:VkCache = @{}

        function Get-VkForChar([System.Char]$ch) {
            if ($script:VkCache.ContainsKey($ch)) { return $script:VkCache[$ch] }
            $vk = 0; $needsShift = $false
            $res = [NativeBridge.Win32]::VkKeyScan($ch)
            $low = ($res -band 0xFFFF)
            # -1 means this layout cannot produce the char via a simple key combo.
            if ($low -ne 0xFFFF) {
                $vk = $low -band 0xFF
                $needsShift = (($res -band 0x100) -ne 0) -or (($res -band 0x200) -ne 0) -or (($res -band 0x400) -ne 0)
            }
            else {
                $map = Get-UsLayoutEntry $ch
                if ($map) { $vk = $map[0]; $needsShift = $map[1] }
            }
            $entry = @($vk, $needsShift)
            $script:VkCache[$ch] = $entry
            return $entry
        }

        function Get-UsLayoutEntry([System.Char]$ch) {
            $code = [int][System.Char]$ch
            if ($ch -eq ' ') { return @(0x20, $false) }
            if ($code -ge 97 -and $code -le 122) { return @((0x41 + $code - 97), $false) }
            if ($code -ge 65 -and $code -le 90) { return @((0x41 + $code - 65), $true) }
            if ($code -ge 48 -and $code -le 57) { return @((0x30 + $code - 48), $false) }
            $shifted = @{
                '!' = 0x31; '@' = 0x32; '#' = 0x33; '$' = 0x34; '%' = 0x35
                '^' = 0x36; '&' = 0x37; '*' = 0x38; '(' = 0x39; ')' = 0x30
                '_' = 0xBD; '+' = 0xBB; '{' = 0xDB; '}' = 0xDD; '|' = 0xDC
                ':' = 0xBA; '"' = 0xDE; '<' = 0xBC; '>' = 0xBE; '?' = 0xBF; '~' = 0xC0
            }
            $plain = @{
                '-' = 0xBD; '=' = 0xBB; '[' = 0xDB; ']' = 0xDD; '\' = 0xDC
                ';' = 0xBA; "'" = 0xDE; ',' = 0xBC; '.' = 0xBE; '/' = 0xBF; '`' = 0xC0
            }
            $key = [string]$ch
            if ($shifted.ContainsKey($key)) { return @($shifted[$key], $true) }
            if ($plain.ContainsKey($key)) { return @($plain[$key], $false) }
            return $null
        }

        $sw = [System.Diagnostics.Stopwatch]::StartNew()

        foreach ($ch in $Text.ToCharArray()) {
            if ($ch -eq "`r") { continue }

            if ($ch -eq "`n") {
                [NativeBridge.Win32]::SendKey(0x0D, $true, $false)
                [NativeBridge.Win32]::Sleep($KeyDelay)
                [NativeBridge.Win32]::SendKey(0x0D, $false, $false)
                $sent++
            }
            elseif ($ch -eq "`t") {
                [NativeBridge.Win32]::SendKey(0x09, $true, $false)
                [NativeBridge.Win32]::Sleep($KeyDelay)
                [NativeBridge.Win32]::SendKey(0x09, $false, $false)
                $sent++
            }
            else {
                $entry = Get-VkForChar $ch
                $vk = [System.UInt16]$entry[0]
                $shift = [System.Boolean]$entry[1]
                if ($vk -eq 0) { continue }

                if ($shift) {
                    [NativeBridge.Win32]::SendKey(0xA0, $true, $false)
                    [NativeBridge.Win32]::Sleep(2)
                }
                [NativeBridge.Win32]::SendKey($vk, $true, $false)
                [NativeBridge.Win32]::Sleep($KeyDelay)
                [NativeBridge.Win32]::SendKey($vk, $false, $false)
                if ($shift) {
                    [NativeBridge.Win32]::Sleep(2)
                    [NativeBridge.Win32]::SendKey(0xA0, $false, $false)
                }
                $sent++
            }

            $gap = $CharDelay
            if ($Jitter -gt 0) { $gap += $rnd.Next(-$Jitter, $Jitter + 1) }
            if ($gap -gt 0) { [NativeBridge.Win32]::Sleep($gap) }
        }

        $sw.Stop()
        Write-Output (@{ ok = $true; chars = $sent; ms = $sw.ElapsedMilliseconds } | ConvertTo-Json -Compress)
    }

    'key' {
        if ($LeadMs -gt 0) { Start-Sleep -Milliseconds $LeadMs }
        $mods = @()
        $mainKey = ''
        if ($Combo.Length -gt 0) {
            $parts = $Combo -split '\+'
            foreach ($p in $parts) {
                switch -Regex ($p.Trim().ToLower()) {
                    '^ctrl$' { $mods += 0xA2 }
                    '^alt$' { $mods += 0xA4 }
                    '^shift$' { $mods += 0xA0 }
                    '^win$' { $mods += 0x5B }
                    default { $mainKey = $p.Trim().ToLower() }
                }
            }
        }
        $vks = @{
            'enter' = 0x0D; 'return' = 0x0D; 'tab' = 0x09; 'space' = 0x20
            'esc' = 0x1B; 'escape' = 0x1B; 'backspace' = 0x08; 'delete' = 0x2E
            'up' = 0x26; 'down' = 0x28; 'left' = 0x25; 'right' = 0x27
            'home' = 0x24; 'end' = 0x23; 'f5' = 0x74
            'a' = 0x41; 'v' = 0x56; 'c' = 0x43
        }
        foreach ($m in $mods) { [NativeBridge.Win32]::SendKey([System.UInt16]$m, $true, $false) }
        if ($mainKey -and $vks.ContainsKey($mainKey)) {
            $vk = [System.UInt16]$vks[$mainKey]
            [NativeBridge.Win32]::SendKey($vk, $true, $false)
            [NativeBridge.Win32]::Sleep($KeyDelay)
            [NativeBridge.Win32]::SendKey($vk, $false, $false)
        }
        for ($i = $mods.Count - 1; $i -ge 0; $i--) {
            [NativeBridge.Win32]::SendKey([System.UInt16]$mods[$i], $false, $false)
        }
        Write-Output (@{ ok = $true; combo = $Combo } | ConvertTo-Json -Compress)
    }

    'input-probe' {
        # Diagnostic: inject a sequence into a throwaway window and read back what
        # landed. Answers "can this environment actually synthesise input?" in one shot.
        if ($TextFile.Length -eq 0) { Fail 'input-probe requires -TextFile (sequence json)' }
        if (-not (Test-Path $TextFile)) { Fail "sequence file not found: $TextFile" }
        $probeSeq = ([System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
        $expected = [string]$probeSeq.expected

        $form = New-Object System.Windows.Forms.Form
        $form.TopMost = $true
        $form.Size = New-Object System.Drawing.Size(760, 140)
        $form.StartPosition = 'CenterScreen'
        $form.Text = 'typing-bot input probe'
        $tb = New-Object System.Windows.Forms.TextBox
        $tb.Dock = 'Fill'
        $tb.Multiline = $true
        $tb.Font = New-Object System.Drawing.Font('Consolas', 14)
        $form.Controls.Add($tb)

        $form.Add_Shown({
                $form.Activate()
                $tb.Focus()
                Wait-Pump 250

                $probeDelay = [int]$probeSeq.keyDelay
                if ($probeDelay -lt 0) { $probeDelay = 5 }
                $script:probeFail = 0
                foreach ($s in $probeSeq.steps) {
                    Wait-Pump ([int]$s.pre)
                    $vk = [System.UInt16]$s.vk
                    if ($vk -gt 0) {
                        $shift = [System.Boolean]$s.shift
                        if ($shift) {
                            if ([NativeBridge.Win32]::SendKey(0xA0, $true, $false) -eq 0) { $script:probeFail++ }
                            Wait-Pump 2
                        }
                        if ([NativeBridge.Win32]::SendKey($vk, $true, $false) -eq 0) { $script:probeFail++ }
                        Wait-Pump $probeDelay
                        if ([NativeBridge.Win32]::SendKey($vk, $false, $false) -eq 0) { $script:probeFail++ }
                        if ($shift) {
                            Wait-Pump 2
                            if ([NativeBridge.Win32]::SendKey(0xA0, $false, $false) -eq 0) { $script:probeFail++ }
                        }
                    }
                    Wait-Pump ([int]$s.post)
                }
                Wait-Pump 250
                $script:captured = $tb.Text
                $form.Close()
            })

        [void]$form.ShowDialog()
        $form.Dispose()

        $verdict = ($script:captured -eq $expected)
        Write-Output (@{
            ok       = $true
            verdict  = $verdict
            expected = $expected
            captured = $script:captured
            failed   = $script:probeFail
            win32    = [NativeBridge.Win32]::LastInputError
        } | ConvertTo-Json -Compress)
    }

    'render' {
        # Draws sample text into a PNG. Used for OCR calibration against the
        # font your game actually renders with, and by the self-test.
        $sample = $Text
        $fontName = $FontName
        $fontSize = $FontSize
        $doScale = $Scale

        if ($TextFile.Length -gt 0) {
            if (-not (Test-Path $TextFile)) { Fail "render spec not found: $TextFile" }
            $spec = ([System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
            if ($spec.text) { $sample = [string]$spec.text }
            if ($spec.font) { $fontName = [string]$spec.font }
            if ($spec.size) { $fontSize = [int]$spec.size }
            if ($spec.scale) { $doScale = [int]$spec.scale }
        }
        if (-not $Out) { Fail 'render requires -Out' }

        $font = New-Object System.Drawing.Font($fontName, $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
        $probe = New-Object System.Drawing.Bitmap(4, 4)
        $pg = [System.Drawing.Graphics]::FromImage($probe)
        $size = $pg.MeasureString($sample, $font)
        $pg.Dispose(); $probe.Dispose()

        $pad = [Math]::Max(12, [int]($fontSize / 2))
        # Pre-compute sizes: PowerShell's argument mode does not reliably parse
        # multi-token expressions, so keep every argument a plain variable.
        $canvasW = [int][Math]::Ceiling($size.Width) + ($pad * 2)
        $canvasH = [int][Math]::Ceiling($size.Height) + ($pad * 2)
        $bmp = New-Object System.Drawing.Bitmap($canvasW, $canvasH)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.Clear([System.Drawing.Color]::White)
        if ($NoAntialias) {
            $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
        }
        else {
            $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        }
        $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
        $g.DrawString($sample, $font, $brush, [float]$pad, [float]$pad)
        $brush.Dispose(); $g.Dispose(); $font.Dispose()

        if ($doScale -gt 1) {
            $bw = $bmp.Width; $bh = $bmp.Height
            $bigW = $bw * $doScale
            $bigH = $bh * $doScale
            $scaled = New-Object System.Drawing.Bitmap($bigW, $bigH)
            $sg = [System.Drawing.Graphics]::FromImage($scaled)
            $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $sg.DrawImage($bmp, 0, 0, $bigW, $bigH)
            $sg.Dispose(); $bmp.Dispose(); $bmp = $scaled
        }

        $dir = Split-Path -Parent $Out
        if ($dir -and -not (Test-Path $dir)) { [void](New-Item -ItemType Directory -Path $dir -Force) }
        if ($Invert) { $bmp = Invoke-InvertBitmap $bmp }
        $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
        $ow = $bmp.Width; $oh = $bmp.Height
        $bmp.Dispose()

        Write-Output (@{ ok = $true; path = $Out; width = $ow; height = $oh } | ConvertTo-Json -Compress)
    }

    default { Fail "unknown command: $Command" }
}
}

# Runs one command and returns its result as the last JSON line it emitted.
function Invoke-Dispatch {
    param([hashtable]$P)
    $script:lastFail = $null
    try {
        $lines = Invoke-TbCommand -P $P | Out-String
    }
    catch {
        if ($script:lastFail) { return $script:lastFail }
        return (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)
    }
    $json = $null
    foreach ($l in ($lines -split "`r?`n")) {
        $t = $l.Trim()
        if ($t.StartsWith('{')) { $json = $t }
    }
    if (-not $json) {
        return (@{ ok = $false; error = "command produced no JSON: $($P['Command'])" } | ConvertTo-Json -Compress)
    }
    return $json
}

function Get-CliArgs {
    return @{
        Command = $Command; Out = $Out; Window = $Window; Handle = $Handle
        X = $X; Y = $Y; W = $W; H = $H; Scale = $Scale
        Text = $Text; TextFile = $TextFile
        KeyDelay = $KeyDelay; CharDelay = $CharDelay; Jitter = $Jitter
        LeadMs = $LeadMs; Combo = $Combo; FontName = $FontName
        FontSize = $FontSize; NoAntialias = [bool]$NoAntialias; Invert = [bool]$Invert
    }
}

$script:lastFail = $null

# ---------------------------------------------------------------- serve mode
# Long-lived host: Node keeps this process alive and sends one JSON request per
# line, so PowerShell startup and Add-Type compilation (~2 s each!) are paid
# once instead of on every capture / keystroke batch.
if ($Command -eq 'serve') {
    [void][NativeBridge.Win32]::timeBeginPeriod(1)
    try {
        $in = [Console]::In
        while ($null -ne ($line = $in.ReadLine())) {
            if (-not $line.Trim()) { continue }
            $req = $null
            try { $req = $line | ConvertFrom-Json }
            catch {
                [Console]::Out.WriteLine('{"id":0,"payload":{"ok":false,"error":"bad json"}}')
                [Console]::Out.Flush()
                continue
            }
            $id = 0
            $p = @{}
            foreach ($prop in $req.PSObject.Properties) {
                if ($prop.Name -eq 'id') { $id = [int]$prop.Value }
                else { $p[$prop.Name] = $prop.Value }
            }
            $payload = Invoke-Dispatch -P $p
            [Console]::Out.WriteLine('{"id":' + $id + ',"payload":' + $payload + '}')
            [Console]::Out.Flush()
        }
    }
    finally {
        [void][NativeBridge.Win32]::timeEndPeriod(1)
    }
    exit 0
}

# ---------------------------------------------------------------- single shot
$result = Invoke-Dispatch -P (Get-CliArgs)
Write-Output $result
if ($result -match '"ok":false') { exit 1 }
