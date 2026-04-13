using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace MacroFlow
{
    /// <summary>
    /// Manages global hotkeys via Win32 RegisterHotKey / UnregisterHotKey.
    /// Hooks into a WPF window's WndProc to receive WM_HOTKEY messages.
    /// </summary>
    public class HotkeyManager : IDisposable
    {
        // ── Win32 ────────────────────────────────────────────────────────────

        private const int WM_HOTKEY = 0x0312;

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("user32.dll")]
        private static extern short VkKeyScan(char ch);

        // Modifier flags
        private const uint MOD_ALT = 0x0001;
        private const uint MOD_CONTROL = 0x0002;
        private const uint MOD_SHIFT = 0x0004;
        private const uint MOD_WIN = 0x0008;
        private const uint MOD_NOREPEAT = 0x4000;

        // ── Fields ───────────────────────────────────────────────────────────

        private readonly Window _owner;
        private HwndSource _source;
        private readonly Dictionary<int, Action> _callbacks = new Dictionary<int, Action>();
        private int _nextId = 9000;
        private bool _disposed;

        // ── Constructor ──────────────────────────────────────────────────────

        public HotkeyManager(Window owner)
        {
            _owner = owner;
            _owner.Loaded += OnWindowLoaded;
            _owner.Closing += OnWindowClosing;
        }

        private void OnWindowLoaded(object sender, RoutedEventArgs e)
        {
            var helper = new WindowInteropHelper(_owner);
            _source = HwndSource.FromHwnd(helper.Handle);
            _source?.AddHook(WndProc);
        }

        private void OnWindowClosing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            UnregisterAll();
        }

        // ── Public API ───────────────────────────────────────────────────────

        /// <summary>
        /// Registers a global hotkey. Returns the assigned ID or -1 on failure.
        /// </summary>
        public int Register(bool ctrl, bool shift, bool alt, bool win, string key, Action callback)
        {
            if (string.IsNullOrWhiteSpace(key)) return -1;
            if (_source == null) return -1;

            uint vk = ResolveVirtualKey(key);
            if (vk == 0) return -1;

            uint mods = MOD_NOREPEAT;
            if (ctrl)  mods |= MOD_CONTROL;
            if (shift) mods |= MOD_SHIFT;
            if (alt)   mods |= MOD_ALT;
            if (win)   mods |= MOD_WIN;

            int id = _nextId++;
            bool ok = RegisterHotKey(_source.Handle, id, mods, vk);
            if (!ok) return -1;

            _callbacks[id] = callback;
            return id;
        }

        /// <summary>
        /// Unregisters a hotkey by its assigned ID.
        /// </summary>
        public void Unregister(int id)
        {
            if (id < 0) return;
            if (_source != null)
                UnregisterHotKey(_source.Handle, id);
            _callbacks.Remove(id);
        }

        /// <summary>
        /// Unregisters all registered hotkeys.
        /// </summary>
        public void UnregisterAll()
        {
            if (_source == null) return;
            foreach (int id in _callbacks.Keys)
                UnregisterHotKey(_source.Handle, id);
            _callbacks.Clear();
        }

        // ── WndProc ──────────────────────────────────────────────────────────

        private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (msg == WM_HOTKEY)
            {
                int id = wParam.ToInt32();
                if (_callbacks.TryGetValue(id, out Action cb))
                {
                    cb?.Invoke();
                    handled = true;
                }
            }
            return IntPtr.Zero;
        }

        // ── Virtual Key Resolution ────────────────────────────────────────────

        private static uint ResolveVirtualKey(string key)
        {
            if (string.IsNullOrEmpty(key)) return 0;

            // Function keys
            if (key.Length == 2 && key[0] == 'F' && int.TryParse(key.Substring(1), out int fn) && fn >= 1 && fn <= 24)
                return (uint)(0x6F + fn); // VK_F1 = 0x70

            // Named keys
            switch (key.ToUpperInvariant())
            {
                case "BACK":        return 0x08;
                case "TAB":         return 0x09;
                case "ENTER":       return 0x0D;
                case "ESCAPE":
                case "ESC":         return 0x1B;
                case "SPACE":       return 0x20;
                case "PAGEUP":      return 0x21;
                case "PAGEDOWN":    return 0x22;
                case "END":         return 0x23;
                case "HOME":        return 0x24;
                case "LEFT":        return 0x25;
                case "UP":          return 0x26;
                case "RIGHT":       return 0x27;
                case "DOWN":        return 0x28;
                case "INSERT":      return 0x2D;
                case "DELETE":
                case "DEL":         return 0x2E;
                case "NUMLOCK":     return 0x90;
                case "SCROLL":      return 0x91;
                case "CAPSLOCK":    return 0x14;
                case "PRINTSCREEN": return 0x2C;
                case "PAUSE":       return 0x13;
            }

            // Single character keys (A-Z, 0-9)
            if (key.Length == 1)
            {
                char c = char.ToUpperInvariant(key[0]);
                if (c >= 'A' && c <= 'Z') return (uint)c;
                if (c >= '0' && c <= '9') return (uint)c;

                short scan = VkKeyScan(c);
                if (scan != -1) return (uint)(scan & 0xFF);
            }

            return 0;
        }

        // ── IDisposable ──────────────────────────────────────────────────────

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            UnregisterAll();
            _source?.RemoveHook(WndProc);
        }
    }
}
