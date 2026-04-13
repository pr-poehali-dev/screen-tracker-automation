using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;

namespace MacroFlow
{
    /// <summary>
    /// Background thread that monitors screen regions for pixel changes.
    /// When a region changes beyond the configured threshold, fires the trigger action.
    /// </summary>
    public class TriggerMonitor : IDisposable
    {
        // ── Win32 ────────────────────────────────────────────────────────────

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int X, Y; }

        // ── Fields ───────────────────────────────────────────────────────────

        private Thread _thread;
        private CancellationTokenSource _cts;
        private readonly object _lock = new object();
        private List<VisualTrigger> _triggers = new List<VisualTrigger>();
        private readonly Dictionary<Guid, Bitmap> _previousFrames = new Dictionary<Guid, Bitmap>();
        private bool _disposed;

        public event Action<string> Log;

        public bool IsRunning => _thread != null && _thread.IsAlive;

        // ── Public API ───────────────────────────────────────────────────────

        public void Start(IEnumerable<VisualTrigger> triggers)
        {
            if (IsRunning) return;

            lock (_lock)
            {
                _triggers = new List<VisualTrigger>(triggers);
                ClearFrames();
            }

            _cts = new CancellationTokenSource();
            _thread = new Thread(MonitorLoop) { IsBackground = true, Name = "TriggerMonitor" };
            _thread.Start();
            RaiseLog("Мониторинг триггеров запущен.");
        }

        public void Stop()
        {
            _cts?.Cancel();
            RaiseLog("Мониторинг триггеров остановлен.");
        }

        public void UpdateTriggers(IEnumerable<VisualTrigger> triggers)
        {
            lock (_lock)
            {
                _triggers = new List<VisualTrigger>(triggers);
            }
        }

        // ── Monitor Loop ─────────────────────────────────────────────────────

        private void MonitorLoop()
        {
            var lastCheck = new Dictionary<Guid, DateTime>();

            while (!_cts.Token.IsCancellationRequested)
            {
                List<VisualTrigger> currentTriggers;
                lock (_lock)
                {
                    currentTriggers = new List<VisualTrigger>(_triggers);
                }

                foreach (VisualTrigger trigger in currentTriggers)
                {
                    if (!trigger.Enabled) continue;
                    if (!trigger.Region.IsValid()) continue;

                    // Rate-limit each trigger to its own interval
                    if (!lastCheck.TryGetValue(trigger.Id, out DateTime last) ||
                        (DateTime.UtcNow - last).TotalMilliseconds >= trigger.CheckIntervalMs)
                    {
                        lastCheck[trigger.Id] = DateTime.UtcNow;
                        CheckTrigger(trigger);
                    }
                }

                Thread.Sleep(50); // poll at 20 Hz, actual trigger intervals enforced above
            }

            ClearFrames();
        }

        private void CheckTrigger(VisualTrigger trigger)
        {
            ScreenRegion region = trigger.Region;
            Bitmap current = null;

            try
            {
                current = CaptureRegion(region.X, region.Y, region.Width, region.Height);
                if (current == null) return;

                if (!_previousFrames.TryGetValue(trigger.Id, out Bitmap previous) || previous == null)
                {
                    _previousFrames[trigger.Id] = current;
                    return;
                }

                double changePercent = CompareFrames(previous, current);

                if (changePercent >= trigger.Threshold)
                {
                    RaiseLog($"Триггер «{trigger.Name}» сработал (изменение {changePercent:F1}%)");
                    FireTriggerAction(trigger);

                    // Reset reference frame so trigger can fire again
                    previous.Dispose();
                    _previousFrames[trigger.Id] = current;
                    current = null;
                }
                else
                {
                    // Update reference frame every check so slow drift doesn't accumulate
                    previous.Dispose();
                    _previousFrames[trigger.Id] = current;
                    current = null;
                }
            }
            catch (Exception ex)
            {
                RaiseLog($"Ошибка триггера «{trigger.Name}»: {ex.Message}");
            }
            finally
            {
                current?.Dispose();
            }
        }

        // ── Screen Capture ───────────────────────────────────────────────────

        private static Bitmap CaptureRegion(int x, int y, int w, int h)
        {
            if (w <= 0 || h <= 0) return null;

            try
            {
                var bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb);
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.CopyFromScreen(x, y, 0, 0, new System.Drawing.Size(w, h), CopyPixelOperation.SourceCopy);
                }
                return bmp;
            }
            catch
            {
                return null;
            }
        }

        // ── Frame Comparison ─────────────────────────────────────────────────

        private static double CompareFrames(Bitmap a, Bitmap b)
        {
            int w = Math.Min(a.Width, b.Width);
            int h = Math.Min(a.Height, b.Height);
            if (w <= 0 || h <= 0) return 0;

            BitmapData dataA = a.LockBits(new Rectangle(0, 0, w, h),
                                           ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            BitmapData dataB = b.LockBits(new Rectangle(0, 0, w, h),
                                           ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);

            long changedPixels = 0;
            long totalPixels = w * h;
            int stride = dataA.Stride;
            const int threshold = 15; // per-channel difference considered "changed"

            unsafe
            {
                byte* ptrA = (byte*)dataA.Scan0.ToPointer();
                byte* ptrB = (byte*)dataB.Scan0.ToPointer();

                for (int row = 0; row < h; row++)
                {
                    byte* rowA = ptrA + row * stride;
                    byte* rowB = ptrB + row * stride;
                    for (int col = 0; col < w; col++)
                    {
                        int pixelOffset = col * 3;
                        int diffB = Math.Abs(rowA[pixelOffset]     - rowB[pixelOffset]);
                        int diffG = Math.Abs(rowA[pixelOffset + 1] - rowB[pixelOffset + 1]);
                        int diffR = Math.Abs(rowA[pixelOffset + 2] - rowB[pixelOffset + 2]);
                        if (diffR > threshold || diffG > threshold || diffB > threshold)
                            changedPixels++;
                    }
                }
            }

            a.UnlockBits(dataA);
            b.UnlockBits(dataB);

            return totalPixels > 0 ? (double)changedPixels / totalPixels * 100.0 : 0;
        }

        // ── Trigger Action ───────────────────────────────────────────────────

        private void FireTriggerAction(VisualTrigger trigger)
        {
            try
            {
                if (trigger.Action == TriggerAction.PressKey)
                {
                    MacroExecutor.SendKeyCombination(false, false, false, trigger.ActionKey);
                }
                else
                {
                    MacroExecutor.SendSingleClick(trigger.ActionMouseX, trigger.ActionMouseY,
                                                  trigger.ActionMouseButton);
                }
            }
            catch (Exception ex)
            {
                RaiseLog($"Ошибка выполнения действия триггера: {ex.Message}");
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private void ClearFrames()
        {
            foreach (var bmp in _previousFrames.Values)
                bmp?.Dispose();
            _previousFrames.Clear();
        }

        private void RaiseLog(string msg)
        {
            Application.Current?.Dispatcher.BeginInvoke(new Action(() => Log?.Invoke(msg)));
        }

        // ── IDisposable ──────────────────────────────────────────────────────

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            Stop();
            ClearFrames();
        }
    }
}
