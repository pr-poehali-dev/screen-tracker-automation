using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows;

namespace MacroFlow
{
    /// <summary>
    /// Executes macro steps using Win32 SendInput, supports repeat with jitter.
    /// </summary>
    public class MacroExecutor : IDisposable
    {
        // ── Win32 Structures ─────────────────────────────────────────────────

        private const int INPUT_MOUSE    = 0;
        private const int INPUT_KEYBOARD = 1;

        private const uint KEYEVENTF_KEYDOWN  = 0x0000;
        private const uint KEYEVENTF_KEYUP    = 0x0002;
        private const uint KEYEVENTF_UNICODE  = 0x0004;
        private const uint KEYEVENTF_SCANCODE = 0x0008;

        private const uint MOUSEEVENTF_MOVE        = 0x0001;
        private const uint MOUSEEVENTF_LEFTDOWN    = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP      = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN   = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP     = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN  = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP    = 0x0040;
        private const uint MOUSEEVENTF_ABSOLUTE    = 0x8000;

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct HARDWAREINPUT
        {
            public uint uMsg;
            public ushort wParamL;
            public ushort wParamH;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct INPUT_UNION
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
            [FieldOffset(0)] public HARDWAREINPUT hi;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public INPUT_UNION u;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern short VkKeyScan(char ch);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        private const int SM_CXSCREEN = 0;
        private const int SM_CYSCREEN = 1;

        // Named VK map
        private static readonly Dictionary<string, ushort> _vkMap = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase)
        {
            { "BACK",        0x08 }, { "TAB",       0x09 }, { "ENTER",  0x0D },
            { "ESCAPE",      0x1B }, { "ESC",        0x1B }, { "SPACE",  0x20 },
            { "PAGEUP",      0x21 }, { "PAGEDOWN",  0x22 }, { "END",    0x23 },
            { "HOME",        0x24 }, { "LEFT",       0x25 }, { "UP",     0x26 },
            { "RIGHT",       0x27 }, { "DOWN",       0x28 }, { "INSERT", 0x2D },
            { "DELETE",      0x2E }, { "DEL",        0x2E }, { "F1",     0x70 },
            { "F2",          0x71 }, { "F3",         0x72 }, { "F4",     0x73 },
            { "F5",          0x74 }, { "F6",         0x75 }, { "F7",     0x76 },
            { "F8",          0x77 }, { "F9",         0x78 }, { "F10",    0x79 },
            { "F11",         0x7A }, { "F12",        0x7B }, { "NUMLOCK",0x90 },
            { "CAPSLOCK",    0x14 }, { "PRINTSCREEN",0x2C }, { "PAUSE",  0x13 },
            { "SCROLL",      0x91 }, { "LSHIFT",     0xA0 }, { "RSHIFT", 0xA1 },
            { "LCTRL",       0xA2 }, { "RCTRL",      0xA3 }, { "LALT",   0xA4 },
            { "RALT",        0xA5 }, { "WIN",        0x5B }
        };

        // ── Fields ───────────────────────────────────────────────────────────

        private Thread _runThread;
        private CancellationTokenSource _cts;
        private bool _disposed;

        public event Action<string> StatusChanged;
        public event Action ExecutionFinished;

        public bool IsRunning => _runThread != null && _runThread.IsAlive;

        // ── Public API ───────────────────────────────────────────────────────

        public void RunOnce(Macro macro)
        {
            if (IsRunning) return;
            _cts = new CancellationTokenSource();
            _runThread = new Thread(() => ExecuteMacroOnce(macro, _cts.Token)) { IsBackground = true };
            _runThread.Start();
        }

        public void RunWithRepeat(Macro macro)
        {
            if (IsRunning) return;
            _cts = new CancellationTokenSource();
            _runThread = new Thread(() => ExecuteWithRepeat(macro, _cts.Token)) { IsBackground = true };
            _runThread.Start();
        }

        public void Stop()
        {
            _cts?.Cancel();
        }

        // ── Execution logic ───────────────────────────────────────────────────

        private void ExecuteWithRepeat(Macro macro, CancellationToken ct)
        {
            var repeat = macro.Repeat;
            var rng = new Random();
            int count = 0;
            DateTime startTime = DateTime.UtcNow;

            RaiseStatus("Выполняется...");

            while (!ct.IsCancellationRequested)
            {
                // Check stop conditions before execution
                if (repeat.StopCondition == StopCondition.ByCount && count >= repeat.StopAfterCount)
                    break;
                if (repeat.StopCondition == StopCondition.ByTime &&
                    (DateTime.UtcNow - startTime).TotalSeconds >= repeat.StopAfterSeconds)
                    break;

                ExecuteMacroOnce(macro, ct);
                count++;

                if (ct.IsCancellationRequested) break;

                // Check stop conditions after execution
                if (repeat.StopCondition == StopCondition.ByCount && count >= repeat.StopAfterCount)
                    break;
                if (repeat.StopCondition == StopCondition.ByTime &&
                    (DateTime.UtcNow - startTime).TotalSeconds >= repeat.StopAfterSeconds)
                    break;

                if (!repeat.Enabled) break;

                // Interval + jitter
                int interval = repeat.IntervalMs;
                if (repeat.JitterMs > 0)
                    interval += rng.Next(-repeat.JitterMs, repeat.JitterMs + 1);
                interval = Math.Max(0, interval);

                SleepCancellable(interval, ct);
            }

            RaiseStatus("Остановлен");
            Application.Current?.Dispatcher.BeginInvoke(new Action(() => ExecutionFinished?.Invoke()));
        }

        private void ExecuteMacroOnce(Macro macro, CancellationToken ct)
        {
            foreach (MacroStep step in macro.Steps)
            {
                if (ct.IsCancellationRequested) return;

                switch (step.Type)
                {
                    case MacroStepType.KeyPress:
                        SendKey(step);
                        break;
                    case MacroStepType.Delay:
                        SleepCancellable(step.DelayMs, ct);
                        break;
                    case MacroStepType.TypeText:
                        TypeText(step.Text ?? "", ct);
                        break;
                    case MacroStepType.MouseClick:
                        SendMouseClick(step.MouseX, step.MouseY, step.MouseButton);
                        break;
                    case MacroStepType.MouseMove:
                        SendMouseMove(step.MouseX, step.MouseY);
                        break;
                }
            }
        }

        // ── SendKey ──────────────────────────────────────────────────────────

        private void SendKey(MacroStep step)
        {
            ushort vk = ResolveVk(step.KeyCode);
            if (vk == 0) return;

            var inputs = new System.Collections.Generic.List<INPUT>();

            // Modifiers down
            if (step.Ctrl)  inputs.Add(MakeKeyInput(0xA2, KEYEVENTF_KEYDOWN));
            if (step.Shift) inputs.Add(MakeKeyInput(0xA0, KEYEVENTF_KEYDOWN));
            if (step.Alt)   inputs.Add(MakeKeyInput(0xA4, KEYEVENTF_KEYDOWN));
            if (step.Win)   inputs.Add(MakeKeyInput(0x5B, KEYEVENTF_KEYDOWN));

            // Key down + up
            inputs.Add(MakeKeyInput(vk, KEYEVENTF_KEYDOWN));
            inputs.Add(MakeKeyInput(vk, KEYEVENTF_KEYUP));

            // Modifiers up (reverse order)
            if (step.Win)   inputs.Add(MakeKeyInput(0x5B, KEYEVENTF_KEYUP));
            if (step.Alt)   inputs.Add(MakeKeyInput(0xA4, KEYEVENTF_KEYUP));
            if (step.Shift) inputs.Add(MakeKeyInput(0xA0, KEYEVENTF_KEYUP));
            if (step.Ctrl)  inputs.Add(MakeKeyInput(0xA2, KEYEVENTF_KEYUP));

            SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));
        }

        // ── TypeText ─────────────────────────────────────────────────────────

        private void TypeText(string text, CancellationToken ct)
        {
            foreach (char c in text)
            {
                if (ct.IsCancellationRequested) return;

                var inputs = new INPUT[2];

                inputs[0] = new INPUT
                {
                    type = INPUT_KEYBOARD,
                    u = new INPUT_UNION
                    {
                        ki = new KEYBDINPUT
                        {
                            wVk = 0,
                            wScan = c,
                            dwFlags = KEYEVENTF_UNICODE,
                            time = 0,
                            dwExtraInfo = IntPtr.Zero
                        }
                    }
                };

                inputs[1] = new INPUT
                {
                    type = INPUT_KEYBOARD,
                    u = new INPUT_UNION
                    {
                        ki = new KEYBDINPUT
                        {
                            wVk = 0,
                            wScan = c,
                            dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                            time = 0,
                            dwExtraInfo = IntPtr.Zero
                        }
                    }
                };

                SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
                Thread.Sleep(10);
            }
        }

        // ── Mouse ────────────────────────────────────────────────────────────

        private void SendMouseMove(int x, int y)
        {
            int screenW = GetSystemMetrics(SM_CXSCREEN);
            int screenH = GetSystemMetrics(SM_CYSCREEN);
            int absX = (int)((double)x / screenW * 65535);
            int absY = (int)((double)y / screenH * 65535);

            var input = new INPUT
            {
                type = INPUT_MOUSE,
                u = new INPUT_UNION
                {
                    mi = new MOUSEINPUT
                    {
                        dx = absX,
                        dy = absY,
                        dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            };
            SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));
        }

        private void SendMouseClick(int x, int y, MouseButton button)
        {
            SendMouseMove(x, y);
            Thread.Sleep(30);

            uint downFlag, upFlag;
            switch (button)
            {
                case MouseButton.Right:
                    downFlag = MOUSEEVENTF_RIGHTDOWN;
                    upFlag   = MOUSEEVENTF_RIGHTUP;
                    break;
                case MouseButton.Middle:
                    downFlag = MOUSEEVENTF_MIDDLEDOWN;
                    upFlag   = MOUSEEVENTF_MIDDLEUP;
                    break;
                default:
                    downFlag = MOUSEEVENTF_LEFTDOWN;
                    upFlag   = MOUSEEVENTF_LEFTUP;
                    break;
            }

            var inputs = new INPUT[2];

            inputs[0] = new INPUT
            {
                type = INPUT_MOUSE,
                u = new INPUT_UNION { mi = new MOUSEINPUT { dwFlags = downFlag } }
            };
            inputs[1] = new INPUT
            {
                type = INPUT_MOUSE,
                u = new INPUT_UNION { mi = new MOUSEINPUT { dwFlags = upFlag } }
            };

            SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        private static INPUT MakeKeyInput(ushort vk, uint flags)
        {
            return new INPUT
            {
                type = INPUT_KEYBOARD,
                u = new INPUT_UNION
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = vk,
                        wScan = 0,
                        dwFlags = flags,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            };
        }

        private static ushort ResolveVk(string key)
        {
            if (string.IsNullOrEmpty(key)) return 0;

            if (_vkMap.TryGetValue(key, out ushort vk)) return vk;

            if (key.Length == 1)
            {
                char c = char.ToUpperInvariant(key[0]);
                if (c >= 'A' && c <= 'Z') return (ushort)c;
                if (c >= '0' && c <= '9') return (ushort)c;

                short scan = VkKeyScan(key[0]);
                if (scan != -1) return (ushort)(scan & 0xFF);
            }

            return 0;
        }

        public static void SendKeyCombination(bool ctrl, bool shift, bool alt, string key)
        {
            var step = new MacroStep
            {
                Type    = MacroStepType.KeyPress,
                KeyCode = key,
                Ctrl    = ctrl,
                Shift   = shift,
                Alt     = alt
            };
            var ex = new MacroExecutor();
            ex.SendKey(step);
            ex.Dispose();
        }

        public static void SendSingleClick(int x, int y, MouseButton button)
        {
            var ex = new MacroExecutor();
            ex.SendMouseClick(x, y, button);
            ex.Dispose();
        }

        private static void SleepCancellable(int ms, CancellationToken ct)
        {
            int elapsed = 0;
            const int chunk = 50;
            while (elapsed < ms && !ct.IsCancellationRequested)
            {
                int sleep = Math.Min(chunk, ms - elapsed);
                Thread.Sleep(sleep);
                elapsed += sleep;
            }
        }

        private void RaiseStatus(string msg)
        {
            Application.Current?.Dispatcher.BeginInvoke(new Action(() => StatusChanged?.Invoke(msg)));
        }

        // ── IDisposable ──────────────────────────────────────────────────────

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _cts?.Cancel();
            _cts?.Dispose();
        }
    }
}
