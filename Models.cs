using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Newtonsoft.Json;

namespace MacroFlow
{
    // ── Enums ────────────────────────────────────────────────────────────────

    public enum MacroStepType
    {
        KeyPress,
        Delay,
        TypeText,
        MouseClick,
        MouseMove
    }

    public enum MouseButton
    {
        Left,
        Right,
        Middle
    }

    public enum StopCondition
    {
        None,
        ByTime,
        ByCount
    }

    public enum TriggerAction
    {
        PressKey,
        ClickMouse
    }

    // ── Base ─────────────────────────────────────────────────────────────────

    public abstract class NotifyBase : INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler PropertyChanged;

        protected void OnPropertyChanged([CallerMemberName] string name = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        }

        protected bool Set<T>(ref T field, T value, [CallerMemberName] string name = null)
        {
            if (Equals(field, value)) return false;
            field = value;
            OnPropertyChanged(name);
            return true;
        }
    }

    // ── MacroStep ────────────────────────────────────────────────────────────

    public class MacroStep : NotifyBase
    {
        private MacroStepType _type = MacroStepType.Delay;
        private string _keyCode = "A";
        private int _delayMs = 500;
        private string _text = "";
        private int _mouseX;
        private int _mouseY;
        private MouseButton _mouseButton = MouseButton.Left;
        private bool _ctrl;
        private bool _shift;
        private bool _alt;
        private bool _win;

        [JsonProperty("id")]
        public Guid Id { get; set; } = Guid.NewGuid();

        [JsonProperty("type")]
        public MacroStepType Type
        {
            get => _type;
            set
            {
                if (Set(ref _type, value))
                    OnPropertyChanged(nameof(DisplayName));
            }
        }

        [JsonProperty("keyCode")]
        public string KeyCode
        {
            get => _keyCode;
            set
            {
                if (Set(ref _keyCode, value))
                    OnPropertyChanged(nameof(DisplayName));
            }
        }

        [JsonProperty("delayMs")]
        public int DelayMs
        {
            get => _delayMs;
            set
            {
                if (Set(ref _delayMs, value))
                    OnPropertyChanged(nameof(DisplayName));
            }
        }

        [JsonProperty("text")]
        public string Text
        {
            get => _text;
            set
            {
                if (Set(ref _text, value))
                    OnPropertyChanged(nameof(DisplayName));
            }
        }

        [JsonProperty("mouseX")]
        public int MouseX
        {
            get => _mouseX;
            set => Set(ref _mouseX, value);
        }

        [JsonProperty("mouseY")]
        public int MouseY
        {
            get => _mouseY;
            set => Set(ref _mouseY, value);
        }

        [JsonProperty("mouseButton")]
        public MouseButton MouseButton
        {
            get => _mouseButton;
            set => Set(ref _mouseButton, value);
        }

        [JsonProperty("ctrl")]
        public bool Ctrl
        {
            get => _ctrl;
            set
            {
                if (Set(ref _ctrl, value))
                    OnPropertyChanged(nameof(DisplayName));
            }
        }

        [JsonProperty("shift")]
        public bool Shift
        {
            get => _shift;
            set
            {
                if (Set(ref _shift, value))
                    OnPropertyChanged(nameof(DisplayName));
            }
        }

        [JsonProperty("alt")]
        public bool Alt
        {
            get => _alt;
            set
            {
                if (Set(ref _alt, value))
                    OnPropertyChanged(nameof(DisplayName));
            }
        }

        [JsonProperty("win")]
        public bool Win
        {
            get => _win;
            set
            {
                if (Set(ref _win, value))
                    OnPropertyChanged(nameof(DisplayName));
            }
        }

        [JsonIgnore]
        public string DisplayName
        {
            get
            {
                switch (Type)
                {
                    case MacroStepType.KeyPress:
                        string mods = "";
                        if (Ctrl) mods += "Ctrl+";
                        if (Shift) mods += "Shift+";
                        if (Alt) mods += "Alt+";
                        if (Win) mods += "Win+";
                        return $"Клавиша: {mods}{KeyCode}";
                    case MacroStepType.Delay:
                        return $"Задержка: {DelayMs} мс";
                    case MacroStepType.TypeText:
                        string preview = Text?.Length > 20 ? Text.Substring(0, 20) + "…" : Text ?? "";
                        return $"Текст: \"{preview}\"";
                    case MacroStepType.MouseClick:
                        return $"Клик мышью: {MouseButton} ({MouseX},{MouseY})";
                    case MacroStepType.MouseMove:
                        return $"Движение мыши: ({MouseX},{MouseY})";
                    default:
                        return "Шаг";
                }
            }
        }
    }

    // ── ScreenRegion ─────────────────────────────────────────────────────────

    public class ScreenRegion : NotifyBase
    {
        private int _x, _y, _width, _height;

        [JsonProperty("x")]
        public int X { get => _x; set => Set(ref _x, value); }

        [JsonProperty("y")]
        public int Y { get => _y; set => Set(ref _y, value); }

        [JsonProperty("width")]
        public int Width { get => _width; set => Set(ref _width, value); }

        [JsonProperty("height")]
        public int Height { get => _height; set => Set(ref _height, value); }

        [JsonIgnore]
        public string DisplayString => $"X:{X} Y:{Y} W:{Width} H:{Height}";

        public bool IsValid() => Width > 0 && Height > 0;
    }

    // ── VisualTrigger ────────────────────────────────────────────────────────

    public class VisualTrigger : NotifyBase
    {
        private bool _enabled = true;
        private string _name = "Триггер";
        private ScreenRegion _region = new ScreenRegion();
        private double _threshold = 5.0;
        private int _checkIntervalMs = 500;
        private TriggerAction _action = TriggerAction.PressKey;
        private string _actionKey = "F1";
        private MouseButton _actionMouseButton = MouseButton.Left;
        private int _actionMouseX;
        private int _actionMouseY;

        [JsonProperty("id")]
        public Guid Id { get; set; } = Guid.NewGuid();

        [JsonProperty("enabled")]
        public bool Enabled { get => _enabled; set => Set(ref _enabled, value); }

        [JsonProperty("name")]
        public string Name { get => _name; set => Set(ref _name, value); }

        [JsonProperty("region")]
        public ScreenRegion Region { get => _region; set => Set(ref _region, value); }

        [JsonProperty("threshold")]
        public double Threshold { get => _threshold; set => Set(ref _threshold, value); }

        [JsonProperty("checkIntervalMs")]
        public int CheckIntervalMs { get => _checkIntervalMs; set => Set(ref _checkIntervalMs, value); }

        [JsonProperty("action")]
        public TriggerAction Action { get => _action; set => Set(ref _action, value); }

        [JsonProperty("actionKey")]
        public string ActionKey { get => _actionKey; set => Set(ref _actionKey, value); }

        [JsonProperty("actionMouseButton")]
        public MouseButton ActionMouseButton { get => _actionMouseButton; set => Set(ref _actionMouseButton, value); }

        [JsonProperty("actionMouseX")]
        public int ActionMouseX { get => _actionMouseX; set => Set(ref _actionMouseX, value); }

        [JsonProperty("actionMouseY")]
        public int ActionMouseY { get => _actionMouseY; set => Set(ref _actionMouseY, value); }
    }

    // ── RepeatSettings ───────────────────────────────────────────────────────

    public class RepeatSettings : NotifyBase
    {
        private bool _enabled;
        private int _intervalMs = 1000;
        private int _jitterMs;
        private StopCondition _stopCondition = StopCondition.None;
        private int _stopAfterSeconds = 60;
        private int _stopAfterCount = 10;

        [JsonProperty("enabled")]
        public bool Enabled { get => _enabled; set => Set(ref _enabled, value); }

        [JsonProperty("intervalMs")]
        public int IntervalMs { get => _intervalMs; set => Set(ref _intervalMs, value); }

        [JsonProperty("jitterMs")]
        public int JitterMs { get => _jitterMs; set => Set(ref _jitterMs, value); }

        [JsonProperty("stopCondition")]
        public StopCondition StopCondition { get => _stopCondition; set => Set(ref _stopCondition, value); }

        [JsonProperty("stopAfterSeconds")]
        public int StopAfterSeconds { get => _stopAfterSeconds; set => Set(ref _stopAfterSeconds, value); }

        [JsonProperty("stopAfterCount")]
        public int StopAfterCount { get => _stopAfterCount; set => Set(ref _stopAfterCount, value); }
    }

    // ── HotkeySettings ───────────────────────────────────────────────────────

    public class HotkeySettings : NotifyBase
    {
        private bool _ctrl;
        private bool _shift;
        private bool _alt;
        private string _key = "";
        private bool _enabled;

        [JsonProperty("ctrl")]
        public bool Ctrl { get => _ctrl; set => Set(ref _ctrl, value); }

        [JsonProperty("shift")]
        public bool Shift { get => _shift; set => Set(ref _shift, value); }

        [JsonProperty("alt")]
        public bool Alt { get => _alt; set => Set(ref _alt, value); }

        [JsonProperty("key")]
        public string Key { get => _key; set { if (Set(ref _key, value)) OnPropertyChanged(nameof(DisplayString)); } }

        [JsonProperty("enabled")]
        public bool Enabled { get => _enabled; set => Set(ref _enabled, value); }

        [JsonIgnore]
        public string DisplayString
        {
            get
            {
                if (string.IsNullOrWhiteSpace(Key)) return "Не задан";
                string mods = "";
                if (Ctrl) mods += "Ctrl+";
                if (Shift) mods += "Shift+";
                if (Alt) mods += "Alt+";
                return mods + Key;
            }
        }
    }

    // ── Macro ────────────────────────────────────────────────────────────────

    public class Macro : NotifyBase
    {
        private string _name = "Новый макрос";
        private bool _enabled = true;
        private ObservableCollection<MacroStep> _steps = new ObservableCollection<MacroStep>();
        private ObservableCollection<VisualTrigger> _triggers = new ObservableCollection<VisualTrigger>();
        private RepeatSettings _repeat = new RepeatSettings();
        private HotkeySettings _hotkey = new HotkeySettings();

        [JsonProperty("id")]
        public Guid Id { get; set; } = Guid.NewGuid();

        [JsonProperty("name")]
        public string Name { get => _name; set => Set(ref _name, value); }

        [JsonProperty("enabled")]
        public bool Enabled { get => _enabled; set => Set(ref _enabled, value); }

        [JsonProperty("steps")]
        public ObservableCollection<MacroStep> Steps { get => _steps; set => Set(ref _steps, value); }

        [JsonProperty("triggers")]
        public ObservableCollection<VisualTrigger> Triggers { get => _triggers; set => Set(ref _triggers, value); }

        [JsonProperty("repeat")]
        public RepeatSettings Repeat { get => _repeat; set => Set(ref _repeat, value); }

        [JsonProperty("hotkey")]
        public HotkeySettings Hotkey { get => _hotkey; set => Set(ref _hotkey, value); }
    }

    // ── MacroStore ───────────────────────────────────────────────────────────

    public class MacroStore : NotifyBase
    {
        [JsonProperty("version")]
        public int Version { get; set; } = 1;

        [JsonProperty("macros")]
        public ObservableCollection<Macro> Macros { get; set; } = new ObservableCollection<Macro>();
    }
}
