using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MacroFlow
{
    /// <summary>
    /// A fullscreen transparent overlay window that lets the user draw a rectangle.
    /// After the user releases the mouse, SelectedRegion is populated and the window closes.
    /// </summary>
    public partial class ScreenRegionSelector : Window
    {
        // ── Result ───────────────────────────────────────────────────────────

        /// <summary>
        /// Set after the user finishes drawing. Null if cancelled.
        /// </summary>
        public ScreenRegion SelectedRegion { get; private set; }

        // ── Fields ───────────────────────────────────────────────────────────

        private bool _isDragging;
        private Point _startPoint;

        // Overlay rectangles that darken everything outside the selection
        private readonly Rectangle _overlayTop    = new Rectangle { Fill = new SolidColorBrush(Color.FromArgb(120, 0, 0, 0)) };
        private readonly Rectangle _overlayLeft   = new Rectangle { Fill = new SolidColorBrush(Color.FromArgb(120, 0, 0, 0)) };
        private readonly Rectangle _overlayRight  = new Rectangle { Fill = new SolidColorBrush(Color.FromArgb(120, 0, 0, 0)) };
        private readonly Rectangle _overlayBottom = new Rectangle { Fill = new SolidColorBrush(Color.FromArgb(120, 0, 0, 0)) };

        // ── Constructor ──────────────────────────────────────────────────────

        public ScreenRegionSelector()
        {
            InitializeComponent();

            // Span all monitors
            double totalWidth  = SystemParameters.VirtualScreenWidth;
            double totalHeight = SystemParameters.VirtualScreenHeight;
            double leftEdge    = SystemParameters.VirtualScreenLeft;
            double topEdge     = SystemParameters.VirtualScreenTop;

            Left   = leftEdge;
            Top    = topEdge;
            Width  = totalWidth;
            Height = totalHeight;

            MainCanvas.Width  = totalWidth;
            MainCanvas.Height = totalHeight;

            // Add overlay rectangles first (below selection rect)
            MainCanvas.Children.Insert(0, _overlayBottom);
            MainCanvas.Children.Insert(0, _overlayRight);
            MainCanvas.Children.Insert(0, _overlayLeft);
            MainCanvas.Children.Insert(0, _overlayTop);

            // Full-screen dark overlay initially
            SetOverlayFull();

            // Position instruction label to centre top
            Loaded += (s, e) =>
            {
                Canvas.SetLeft(InstructionBorder, (MainCanvas.ActualWidth - InstructionBorder.ActualWidth) / 2);
                Canvas.SetTop(InstructionBorder, 30);
            };

            KeyDown += OnKeyDown;
        }

        // ── Overlay helpers ──────────────────────────────────────────────────

        private void SetOverlayFull()
        {
            double w = MainCanvas.Width;
            double h = MainCanvas.Height;

            SetRect(_overlayTop,    0, 0, w, h);
            SetRect(_overlayLeft,   0, 0, 0, 0);
            SetRect(_overlayRight,  0, 0, 0, 0);
            SetRect(_overlayBottom, 0, 0, 0, 0);
        }

        private void UpdateOverlay(double selX, double selY, double selW, double selH)
        {
            double cw = MainCanvas.Width;
            double ch = MainCanvas.Height;

            // Top strip: full width, height = selY
            SetRect(_overlayTop, 0, 0, cw, selY);

            // Bottom strip: full width, starts at selY+selH
            SetRect(_overlayBottom, 0, selY + selH, cw, ch - (selY + selH));

            // Left strip: between top and bottom, width = selX
            SetRect(_overlayLeft, 0, selY, selX, selH);

            // Right strip: from selX+selW to right edge
            SetRect(_overlayRight, selX + selW, selY, cw - (selX + selW), selH);
        }

        private static void SetRect(Rectangle r, double x, double y, double w, double h)
        {
            Canvas.SetLeft(r, x);
            Canvas.SetTop(r, y);
            r.Width  = Math.Max(0, w);
            r.Height = Math.Max(0, h);
        }

        // ── Mouse Events ─────────────────────────────────────────────────────

        private void Canvas_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            _isDragging = true;
            _startPoint = e.GetPosition(MainCanvas);
            MainCanvas.CaptureMouse();

            SelectionRect.Visibility = Visibility.Visible;
            InstructionBorder.Visibility = Visibility.Collapsed;
            InfoBorder.Visibility = Visibility.Visible;

            Canvas.SetLeft(SelectionRect, _startPoint.X);
            Canvas.SetTop(SelectionRect, _startPoint.Y);
            SelectionRect.Width  = 0;
            SelectionRect.Height = 0;

            UpdateOverlay(_startPoint.X, _startPoint.Y, 0, 0);
        }

        private void Canvas_MouseMove(object sender, MouseEventArgs e)
        {
            if (!_isDragging) return;

            Point current = e.GetPosition(MainCanvas);

            double x = Math.Min(_startPoint.X, current.X);
            double y = Math.Min(_startPoint.Y, current.Y);
            double w = Math.Abs(current.X - _startPoint.X);
            double h = Math.Abs(current.Y - _startPoint.Y);

            Canvas.SetLeft(SelectionRect, x);
            Canvas.SetTop(SelectionRect, y);
            SelectionRect.Width  = w;
            SelectionRect.Height = h;

            UpdateOverlay(x, y, w, h);

            // Update info label
            InfoText.Text = $"X:{(int)x}  Y:{(int)y}  W:{(int)w}  H:{(int)h}";
            double labelX = x + w + 8;
            double labelY = y;
            if (labelX + 180 > MainCanvas.Width) labelX = x - 188;
            if (labelY + 30 > MainCanvas.Height) labelY = y - 34;
            Canvas.SetLeft(InfoBorder, Math.Max(0, labelX));
            Canvas.SetTop(InfoBorder, Math.Max(0, labelY));
        }

        private void Canvas_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            if (!_isDragging) return;
            _isDragging = false;
            MainCanvas.ReleaseMouseCapture();

            Point current = e.GetPosition(MainCanvas);

            double x = Math.Min(_startPoint.X, current.X);
            double y = Math.Min(_startPoint.Y, current.Y);
            double w = Math.Abs(current.X - _startPoint.X);
            double h = Math.Abs(current.Y - _startPoint.Y);

            if (w >= 5 && h >= 5)
            {
                // Convert canvas coordinates to screen coordinates
                double scaleX = SystemParameters.VirtualScreenWidth  / MainCanvas.Width;
                double scaleY = SystemParameters.VirtualScreenHeight / MainCanvas.Height;

                SelectedRegion = new ScreenRegion
                {
                    X      = (int)(x + SystemParameters.VirtualScreenLeft),
                    Y      = (int)(y + SystemParameters.VirtualScreenTop),
                    Width  = (int)w,
                    Height = (int)h
                };
            }

            DialogResult = SelectedRegion != null;
        }

        // ── Keyboard ─────────────────────────────────────────────────────────

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                SelectedRegion = null;
                DialogResult = false;
            }
        }
    }
}
