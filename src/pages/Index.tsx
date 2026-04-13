import { useState, useCallback, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";

type StepType = "key" | "delay" | "text";
type TriggerAction = "hotkey" | "click";

interface RepeatSettings {
  enabled: boolean;
  intervalMs: number;
  durationSec: number;
  maxCount: number;
  useCount: boolean;
}

interface Step {
  id: string;
  type: StepType;
  value: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface VisualTrigger {
  id: string;
  label: string;
  rect: Rect | null;
  sensitivity: number;
  action: TriggerAction;
  hotkey: string;
  clickX: number;
  clickY: number;
  enabled: boolean;
  firedCount: number;
}

interface Macro {
  id: string;
  name: string;
  hotkey: string;
  enabled: boolean;
  steps: Step[];
  runCount: number;
  triggers: VisualTrigger[];
  repeat: RepeatSettings;
}

const DEFAULT_REPEAT: RepeatSettings = {
  enabled: false,
  intervalMs: 1000,
  durationSec: 60,
  maxCount: 10,
  useCount: false,
};

const initialMacros: Macro[] = [
  {
    id: "1",
    name: "Сохранить документ",
    hotkey: "Ctrl+Shift+S",
    enabled: true,
    runCount: 42,
    triggers: [],
    repeat: { ...DEFAULT_REPEAT },
    steps: [
      { id: "s1", type: "key", value: "Ctrl+S" },
      { id: "s2", type: "delay", value: "500" },
      { id: "s3", type: "key", value: "Enter" },
    ],
  },
  {
    id: "2",
    name: "Рыбалка — поплавок",
    hotkey: "Ctrl+Alt+F",
    enabled: true,
    runCount: 17,
    triggers: [
      {
        id: "t1",
        label: "Поплавок",
        rect: { x: 840, y: 420, w: 120, h: 80 },
        sensitivity: 30,
        action: "hotkey",
        hotkey: "Space",
        clickX: 0,
        clickY: 0,
        enabled: true,
        firedCount: 7,
      },
    ],
    repeat: { enabled: true, intervalMs: 2000, durationSec: 300, maxCount: 50, useCount: false },
    steps: [
      { id: "s4", type: "key", value: "Space" },
    ],
  },
  {
    id: "3",
    name: "Скриншот экрана",
    hotkey: "Ctrl+Shift+P",
    enabled: false,
    runCount: 5,
    triggers: [],
    repeat: { ...DEFAULT_REPEAT },
    steps: [
      { id: "s8", type: "key", value: "PrintScreen" },
    ],
  },
];

const STEP_TYPE_LABELS: Record<StepType, string> = {
  key: "Клавиша",
  delay: "Задержка",
  text: "Текст",
};
const STEP_TYPE_ICONS: Record<StepType, string> = {
  key: "Keyboard",
  delay: "Timer",
  text: "Type",
};
const STEP_TYPE_COLORS: Record<StepType, string> = {
  key: "text-primary",
  delay: "text-yellow-400",
  text: "text-blue-400",
};

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

type Tab = "steps" | "triggers" | "repeat";

export default function Index() {
  const [macros, setMacros] = useState<Macro[]>(initialMacros);
  const [selectedId, setSelectedId] = useState<string | null>("1");
  const [activeTab, setActiveTab] = useState<Tab>("steps");

  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [recordingTarget, setRecordingTarget] = useState<string | null>(null);

  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [runningId, setRunningId] = useState<string | null>(null);

  const [showNewStep, setShowNewStep] = useState(false);
  const [newStepType, setNewStepType] = useState<StepType>("key");
  const [newStepValue, setNewStepValue] = useState("");

  // Trigger drawing state
  const [drawingTrigger, setDrawingTrigger] = useState<string | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Trigger hotkey recording
  const [recordingTriggerHotkey, setRecordingTriggerHotkey] = useState<string | null>(null);

  // Fired flash
  const [firedTrigger, setFiredTrigger] = useState<string | null>(null);

  // Repeat timer state
  const [repeatRunning, setRepeatRunning] = useState<string | null>(null);
  const [repeatCount, setRepeatCount] = useState(0);
  const [repeatSecondsLeft, setRepeatSecondsLeft] = useState(0);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = useCallback(() => {
    if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current);
    if (repeatTickRef.current) clearInterval(repeatTickRef.current);
    repeatIntervalRef.current = null;
    repeatTickRef.current = null;
    setRepeatRunning(null);
    setRepeatCount(0);
    setRepeatSecondsLeft(0);
  }, []);

  const startRepeat = useCallback((macroId: string, settings: RepeatSettings) => {
    if (repeatRunning) { stopRepeat(); return; }
    setRepeatRunning(macroId);
    setRepeatCount(0);
    setRepeatSecondsLeft(settings.durationSec);

    let count = 0;
    const doRun = () => {
      count += 1;
      setRepeatCount(count);
      setMacros((ms) => ms.map((m) => m.id === macroId ? { ...m, runCount: m.runCount + 1 } : m));
      if (settings.useCount && count >= settings.maxCount) {
        stopRepeat();
      }
    };

    doRun();
    repeatIntervalRef.current = setInterval(() => {
      doRun();
    }, settings.intervalMs);

    if (!settings.useCount) {
      let sec = settings.durationSec;
      repeatTickRef.current = setInterval(() => {
        sec -= 1;
        setRepeatSecondsLeft(sec);
        if (sec <= 0) stopRepeat();
      }, 1000);
    }
  }, [repeatRunning, stopRepeat]);

  useEffect(() => () => stopRepeat(), [stopRepeat]);

  const updateRepeat = useCallback((macroId: string, patch: Partial<RepeatSettings>) => {
    setMacros((ms) =>
      ms.map((m) => m.id === macroId ? { ...m, repeat: { ...m.repeat, ...patch } } : m)
    );
  }, []);

  const selected = macros.find((m) => m.id === selectedId) ?? null;

  const updateMacro = useCallback((id: string, patch: Partial<Macro>) => {
    setMacros((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const updateTrigger = useCallback((macroId: string, triggerId: string, patch: Partial<VisualTrigger>) => {
    setMacros((ms) =>
      ms.map((m) =>
        m.id === macroId
          ? { ...m, triggers: m.triggers.map((t) => (t.id === triggerId ? { ...t, ...patch } : t)) }
          : m
      )
    );
  }, []);

  const addMacro = () => {
    const id = generateId();
    setMacros((ms) => [
      ...ms,
      { id, name: "Новый макрос", hotkey: "", enabled: true, runCount: 0, steps: [], triggers: [], repeat: { ...DEFAULT_REPEAT } },
    ]);
    setSelectedId(id);
    setActiveTab("steps");
  };

  const deleteMacro = (id: string) => {
    const remaining = macros.filter((m) => m.id !== id);
    setMacros(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
  };

  const runMacro = (id: string) => {
    setRunningId(id);
    setMacros((ms) => ms.map((m) => (m.id === id ? { ...m, runCount: m.runCount + 1 } : m)));
    setTimeout(() => setRunningId(null), 1200);
  };

  // Macro hotkey recording
  const startRecordingHotkey = (macroId: string) => {
    setRecordingTarget(macroId);
    setIsRecordingHotkey(true);
  };

  useEffect(() => {
    if (!isRecordingHotkey) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Win");
      const key = e.key;
      if (!["Control", "Alt", "Shift", "Meta"].includes(key))
        parts.push(key.length === 1 ? key.toUpperCase() : key);
      if (parts.length > 0 && recordingTarget)
        updateMacro(recordingTarget, { hotkey: parts.join("+") });
      setIsRecordingHotkey(false);
      setRecordingTarget(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRecordingHotkey, recordingTarget, updateMacro]);

  // Trigger hotkey recording
  useEffect(() => {
    if (!recordingTriggerHotkey) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Win");
      const key = e.key;
      if (!["Control", "Alt", "Shift", "Meta"].includes(key))
        parts.push(key.length === 1 ? key.toUpperCase() : key);
      if (parts.length > 0 && selectedId) {
        const [macroId, triggerId] = recordingTriggerHotkey.split(":");
        updateTrigger(macroId, triggerId, { hotkey: parts.join("+") });
      }
      setRecordingTriggerHotkey(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [recordingTriggerHotkey, selectedId, updateTrigger]);

  const startEditName = (macro: Macro) => {
    setEditingName(macro.id);
    setNameValue(macro.name);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    if (editingName && nameValue.trim()) updateMacro(editingName, { name: nameValue.trim() });
    setEditingName(null);
  };

  const deleteStep = (macroId: string, stepId: string) => {
    setMacros((ms) =>
      ms.map((m) =>
        m.id === macroId ? { ...m, steps: m.steps.filter((s) => s.id !== stepId) } : m
      )
    );
  };

  const addStep = () => {
    if (!selectedId || !newStepValue.trim()) return;
    const step: Step = { id: generateId(), type: newStepType, value: newStepValue.trim() };
    setMacros((ms) => ms.map((m) => (m.id === selectedId ? { ...m, steps: [...m.steps, step] } : m)));
    setNewStepValue("");
    setShowNewStep(false);
  };

  // Visual trigger drawing
  const startDrawing = (macroId: string) => {
    setDrawingTrigger(macroId);
    setDrawStart(null);
    setDrawCurrent(null);
  };

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    setDrawStart({ x: e.clientX, y: e.clientY });
    setDrawCurrent({ x: e.clientX, y: e.clientY });
  };

  const handleOverlayMouseMove = (e: React.MouseEvent) => {
    if (!drawStart) return;
    setDrawCurrent({ x: e.clientX, y: e.clientY });
  };

  const handleOverlayMouseUp = () => {
    if (!drawStart || !drawCurrent || !drawingTrigger) return;
    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const w = Math.abs(drawCurrent.x - drawStart.x);
    const h = Math.abs(drawCurrent.y - drawStart.y);
    if (w < 10 || h < 10) { setDrawingTrigger(null); return; }
    const newTrigger: VisualTrigger = {
      id: generateId(),
      label: "Область наблюдения",
      rect: { x, y, w, h },
      sensitivity: 30,
      action: "hotkey",
      hotkey: "",
      clickX: 0,
      clickY: 0,
      enabled: true,
      firedCount: 0,
    };
    setMacros((ms) =>
      ms.map((m) =>
        m.id === drawingTrigger ? { ...m, triggers: [...m.triggers, newTrigger] } : m
      )
    );
    setDrawingTrigger(null);
    setDrawStart(null);
    setDrawCurrent(null);
  };

  const deleteTrigger = (macroId: string, triggerId: string) => {
    setMacros((ms) =>
      ms.map((m) =>
        m.id === macroId ? { ...m, triggers: m.triggers.filter((t) => t.id !== triggerId) } : m
      )
    );
  };

  const simulateFire = (triggerId: string, macroId: string) => {
    setFiredTrigger(triggerId);
    setMacros((ms) =>
      ms.map((m) =>
        m.id === macroId
          ? { ...m, triggers: m.triggers.map((t) => t.id === triggerId ? { ...t, firedCount: t.firedCount + 1 } : t) }
          : m
      )
    );
    setTimeout(() => setFiredTrigger(null), 900);
  };

  const drawRect =
    drawStart && drawCurrent
      ? {
          left: Math.min(drawStart.x, drawCurrent.x),
          top: Math.min(drawStart.y, drawCurrent.y),
          width: Math.abs(drawCurrent.x - drawStart.x),
          height: Math.abs(drawCurrent.y - drawStart.y),
        }
      : null;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>

      {/* Drawing overlay */}
      {drawingTrigger && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 cursor-crosshair"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onMouseDown={handleOverlayMouseDown}
          onMouseMove={handleOverlayMouseMove}
          onMouseUp={handleOverlayMouseUp}
        >
          <div className="absolute top-6 left-1/2 -translate-x-1/2 text-xs text-white/70 bg-black/60 px-4 py-2 rounded-sm border border-white/10"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            Нарисуйте область наблюдения мышью &nbsp;·&nbsp; Esc — отмена
          </div>
          {drawRect && drawRect.width > 4 && drawRect.height > 4 && (
            <div
              className="absolute border-2 border-primary"
              style={{
                left: drawRect.left,
                top: drawRect.top,
                width: drawRect.width,
                height: drawRect.height,
                background: "rgba(52,211,153,0.08)",
              }}
            >
              <div className="absolute -top-5 left-0 text-[10px] text-primary" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                {Math.round(drawRect.width)} × {Math.round(drawRect.height)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 border-r border-border flex flex-col" style={{ background: "hsl(220, 13%, 7%)" }}>
        <div className="px-5 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <Icon name="Zap" size={14} className="text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-wide text-foreground" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              MacroFlow
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-2">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Макросы</span>
            <button onClick={addMacro} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted transition-colors">
              <Icon name="Plus" size={13} />
            </button>
          </div>

          <div className="space-y-0.5">
            {macros.map((macro) => (
              <button
                key={macro.id}
                onClick={() => { setSelectedId(macro.id); setActiveTab("steps"); }}
                className={`w-full text-left px-3 py-2.5 rounded-sm macro-card border transition-all ${selectedId === macro.id ? "active border-primary/40" : "border-transparent"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${macro.enabled ? "bg-primary" : "bg-muted-foreground"}`} />
                      <span className="text-xs font-medium truncate text-foreground">{macro.name}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {macro.hotkey && <span className="kbd-tag">{macro.hotkey}</span>}
                      {macro.triggers.length > 0 && (
                        <span className="text-[9px] text-primary/70 flex items-center gap-0.5">
                          <Icon name="Eye" size={9} />
                          {macro.triggers.length}
                        </span>
                      )}
                    </div>
                  </div>
                  {runningId === macro.id && <Icon name="Loader" size={12} className="text-primary animate-spin mt-0.5 flex-shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border">
          <div className="text-[10px] text-muted-foreground">
            <span className="text-foreground font-medium">{macros.filter((m) => m.enabled).length}</span> активных &nbsp;·&nbsp;{" "}
            <span className="text-foreground font-medium">{macros.reduce((a, m) => a + m.runCount, 0)}</span> запусков
          </div>
        </div>
      </aside>

      {/* Main */}
      {selected ? (
        <main className="flex-1 flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <header className="px-8 py-5 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              {editingName === selected.id ? (
                <input
                  ref={nameInputRef}
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => e.key === "Enter" && commitName()}
                  className="text-lg font-semibold bg-transparent border-b border-primary outline-none text-foreground w-56"
                />
              ) : (
                <button onClick={() => startEditName(selected)} className="text-lg font-semibold text-foreground hover:text-primary transition-colors group flex items-center gap-2">
                  {selected.name}
                  <Icon name="Pencil" size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateMacro(selected.id, { enabled: !selected.enabled })}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-sm border transition-all ${selected.enabled ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${selected.enabled ? "bg-primary" : "bg-muted-foreground"}`} />
                {selected.enabled ? "Включён" : "Выключен"}
              </button>
              <button
                onClick={() => runMacro(selected.id)}
                disabled={runningId === selected.id}
                className="flex items-center gap-2 text-xs px-4 py-1.5 rounded-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {runningId === selected.id ? (
                  <><Icon name="Loader" size={13} className="animate-spin" />Выполняется</>
                ) : (
                  <><Icon name="Play" size={13} />Запустить</>
                )}
              </button>
              <button onClick={() => deleteMacro(selected.id)} className="w-8 h-8 flex items-center justify-center rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          </header>

          {/* Tabs */}
          <div className="flex border-b border-border px-8 flex-shrink-0">
            {(["steps", "triggers", "repeat"] as Tab[]).map((tab) => {
              const labels: Record<Tab, string> = { steps: "Шаги", triggers: "Триггеры", repeat: "Повтор" };
              const icons: Record<Tab, string> = { steps: "ListOrdered", triggers: "Eye", repeat: "RefreshCw" };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-1 py-3 mr-6 text-xs font-medium border-b-2 transition-all ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon name={icons[tab]} size={13} />
                  {labels[tab]}
                  {tab === "triggers" && selected.triggers.length > 0 && (
                    <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{selected.triggers.length}</span>
                  )}
                  {tab === "repeat" && selected.repeat.enabled && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-8 py-8">

              {/* ── STEPS TAB ── */}
              {activeTab === "steps" && (
                <>
                  {/* Hotkey */}
                  <section className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name="Keyboard" size={13} className="text-muted-foreground" />
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Горячая клавиша</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-10 flex items-center px-3 rounded-sm border border-border bg-card">
                        {selected.hotkey
                          ? <span className="kbd-tag text-sm">{selected.hotkey}</span>
                          : <span className="text-muted-foreground text-xs">Не назначена</span>}
                      </div>
                      <button
                        onClick={() => startRecordingHotkey(selected.id)}
                        className={`px-4 h-10 text-xs rounded-sm border transition-all font-medium ${isRecordingHotkey && recordingTarget === selected.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                      >
                        {isRecordingHotkey && recordingTarget === selected.id
                          ? <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-primary blink" />Нажмите клавишу...</span>
                          : "Записать"}
                      </button>
                      {selected.hotkey && (
                        <button onClick={() => updateMacro(selected.id, { hotkey: "" })} className="w-10 h-10 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-destructive transition-colors">
                          <Icon name="X" size={13} />
                        </button>
                      )}
                    </div>
                  </section>

                  {/* Steps */}
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Icon name="ListOrdered" size={13} className="text-muted-foreground" />
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Шаги выполнения</span>
                      </div>
                      <button onClick={() => setShowNewStep(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                        <Icon name="Plus" size={12} />Добавить
                      </button>
                    </div>
                    <div className="rounded-sm border border-border overflow-hidden">
                      {selected.steps.length === 0 && !showNewStep ? (
                        <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
                          <Icon name="MousePointerClick" size={24} className="opacity-30" />
                          <span className="text-xs">Нет шагов — нажмите «Добавить»</span>
                        </div>
                      ) : (
                        <>
                          {selected.steps.map((step, idx) => (
                            <div key={step.id} className="step-row flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 group">
                              <span className="w-5 text-right text-[10px] text-muted-foreground flex-shrink-0" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                              <div className={`flex items-center gap-1.5 w-24 flex-shrink-0 ${STEP_TYPE_COLORS[step.type]}`}>
                                <Icon name={STEP_TYPE_ICONS[step.type]} fallback="Circle" size={12} />
                                <span className="text-[10px] uppercase tracking-wider font-medium">{STEP_TYPE_LABELS[step.type]}</span>
                              </div>
                              <div className="flex-1">
                                {step.type === "delay"
                                  ? <span className="text-xs text-foreground" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{step.value} мс</span>
                                  : <span className="kbd-tag">{step.value}</span>}
                              </div>
                              <button onClick={() => deleteStep(selected.id, step.id)} className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
                                <Icon name="X" size={12} />
                              </button>
                            </div>
                          ))}
                          {showNewStep && (
                            <div className="flex items-center gap-3 px-4 py-3 border-t border-border animate-fade-in" style={{ background: "hsl(220,13%,12%)" }}>
                              <span className="w-5 text-right text-[10px] text-muted-foreground flex-shrink-0" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                {String(selected.steps.length + 1).padStart(2, "0")}
                              </span>
                              <select
                                value={newStepType}
                                onChange={(e) => setNewStepType(e.target.value as StepType)}
                                className="text-[10px] uppercase tracking-wider bg-muted border border-border rounded-sm px-2 py-1.5 text-foreground outline-none focus:border-primary w-28"
                                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                              >
                                <option value="key">Клавиша</option>
                                <option value="delay">Задержка</option>
                                <option value="text">Текст</option>
                              </select>
                              <input
                                autoFocus
                                value={newStepValue}
                                onChange={(e) => setNewStepValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") addStep(); if (e.key === "Escape") setShowNewStep(false); }}
                                placeholder={newStepType === "key" ? "Ctrl+C" : newStepType === "delay" ? "500" : "введите текст..."}
                                className="flex-1 bg-transparent border-b border-border text-xs text-foreground outline-none focus:border-primary pb-0.5 placeholder:text-muted-foreground"
                                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                              />
                              <button onClick={addStep} className="text-xs text-primary font-medium">↵</button>
                              <button onClick={() => setShowNewStep(false)} className="text-muted-foreground hover:text-foreground"><Icon name="X" size={12} /></button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </section>

                  <div className="mt-6 flex items-center gap-6 text-[10px] text-muted-foreground" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    <span>запусков: <span className="text-foreground">{selected.runCount}</span></span>
                    <span>id: <span className="text-foreground">{selected.id}</span></span>
                  </div>
                </>
              )}

              {/* ── TRIGGERS TAB ── */}
              {activeTab === "triggers" && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground mb-0.5">Визуальные триггеры</h2>
                      <p className="text-[11px] text-muted-foreground">Следят за изменением картинки в заданной области экрана</p>
                    </div>
                    <button
                      onClick={() => startDrawing(selected.id)}
                      className="flex items-center gap-2 text-xs px-4 py-2 rounded-sm border border-primary/40 text-primary hover:bg-primary/10 transition-colors font-medium"
                    >
                      <Icon name="Crosshair" size={13} />
                      Нарисовать область
                    </button>
                  </div>

                  {selected.triggers.length === 0 ? (
                    <div className="border border-dashed border-border rounded-sm py-16 flex flex-col items-center gap-4 text-muted-foreground">
                      <div className="w-12 h-12 rounded-sm border border-border flex items-center justify-center opacity-40">
                        <Icon name="ScanEye" size={20} />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-medium text-foreground mb-1">Нет триггеров</p>
                        <p className="text-[11px]">Нажмите «Нарисовать область» и выделите<br />нужную зону на экране</p>
                      </div>
                      <button
                        onClick={() => startDrawing(selected.id)}
                        className="flex items-center gap-2 text-xs px-4 py-2 rounded-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                      >
                        <Icon name="Crosshair" size={13} />
                        Нарисовать область
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selected.triggers.map((trigger) => (
                        <div
                          key={trigger.id}
                          className={`rounded-sm border transition-all ${firedTrigger === trigger.id ? "border-primary bg-primary/8" : "border-border bg-card"}`}
                        >
                          {/* Trigger header */}
                          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => updateTrigger(selected.id, trigger.id, { enabled: !trigger.enabled })}
                                className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${trigger.enabled ? "bg-primary" : "bg-muted"}`}
                              >
                                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${trigger.enabled ? "left-4.5" : "left-0.5"}`} style={{ left: trigger.enabled ? "18px" : "2px" }} />
                              </button>
                              <input
                                value={trigger.label}
                                onChange={(e) => updateTrigger(selected.id, trigger.id, { label: e.target.value })}
                                className="text-xs font-medium bg-transparent text-foreground outline-none border-b border-transparent focus:border-primary/40 pb-0.5"
                              />
                              {firedTrigger === trigger.id && (
                                <span className="text-[10px] text-primary flex items-center gap-1 animate-fade-in" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary blink" />СРАБОТАЛ
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                ×{trigger.firedCount}
                              </span>
                              <button
                                onClick={() => simulateFire(trigger.id, selected.id)}
                                className="text-[10px] px-2.5 py-1 rounded-sm border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                              >
                                Тест
                              </button>
                              <button onClick={() => deleteTrigger(selected.id, trigger.id)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                                <Icon name="X" size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Trigger body */}
                          <div className="px-4 py-4 grid grid-cols-2 gap-4">
                            {/* Area */}
                            <div>
                              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium">Область</div>
                              {trigger.rect ? (
                                <div className="text-[11px] text-foreground bg-muted rounded-sm px-3 py-2 flex items-center justify-between" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                  <span>{trigger.rect.x},{trigger.rect.y} · {Math.round(trigger.rect.w)}×{Math.round(trigger.rect.h)}</span>
                                  <button onClick={() => startDrawing(selected.id)} className="text-muted-foreground hover:text-primary ml-2 transition-colors">
                                    <Icon name="Pencil" size={11} />
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => startDrawing(selected.id)} className="text-[11px] w-full text-left text-muted-foreground border border-dashed border-border rounded-sm px-3 py-2 hover:border-primary/40 hover:text-foreground transition-colors">
                                  Не задана — нарисовать
                                </button>
                              )}
                            </div>

                            {/* Sensitivity */}
                            <div>
                              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium flex items-center justify-between">
                                <span>Чувствительность</span>
                                <span className="text-foreground" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{trigger.sensitivity}%</span>
                              </div>
                              <input
                                type="range"
                                min={5}
                                max={95}
                                value={trigger.sensitivity}
                                onChange={(e) => updateTrigger(selected.id, trigger.id, { sensitivity: Number(e.target.value) })}
                                className="w-full accent-primary h-1"
                              />
                              <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                                <span>любое</span><span>резкое</span>
                              </div>
                            </div>

                            {/* Action */}
                            <div className="col-span-2">
                              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium">Действие при срабатывании</div>
                              <div className="flex gap-2 mb-3">
                                <button
                                  onClick={() => updateTrigger(selected.id, trigger.id, { action: "hotkey" })}
                                  className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-sm border transition-all ${trigger.action === "hotkey" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                                >
                                  <Icon name="Keyboard" size={12} />
                                  Горячая клавиша
                                </button>
                                <button
                                  onClick={() => updateTrigger(selected.id, trigger.id, { action: "click" })}
                                  className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-sm border transition-all ${trigger.action === "click" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                                >
                                  <Icon name="MousePointer" size={12} />
                                  Клик мышью
                                </button>
                              </div>

                              {trigger.action === "hotkey" && (
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 h-9 flex items-center px-3 rounded-sm border border-border bg-background">
                                    {trigger.hotkey
                                      ? <span className="kbd-tag">{trigger.hotkey}</span>
                                      : <span className="text-muted-foreground text-xs">Не задана</span>}
                                  </div>
                                  <button
                                    onClick={() => setRecordingTriggerHotkey(`${selected.id}:${trigger.id}`)}
                                    className={`px-3 h-9 text-xs rounded-sm border transition-all ${recordingTriggerHotkey === `${selected.id}:${trigger.id}` ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                                  >
                                    {recordingTriggerHotkey === `${selected.id}:${trigger.id}`
                                      ? <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary blink" />Нажмите...</span>
                                      : "Записать"}
                                  </button>
                                  {trigger.hotkey && (
                                    <button onClick={() => updateTrigger(selected.id, trigger.id, { hotkey: "" })} className="w-9 h-9 flex items-center justify-center border border-border rounded-sm text-muted-foreground hover:text-destructive transition-colors">
                                      <Icon name="X" size={12} />
                                    </button>
                                  )}
                                </div>
                              )}

                              {trigger.action === "click" && (
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2 flex-1">
                                    <span className="text-[10px] text-muted-foreground w-4">X</span>
                                    <input
                                      type="number"
                                      value={trigger.clickX}
                                      onChange={(e) => updateTrigger(selected.id, trigger.id, { clickX: Number(e.target.value) })}
                                      className="w-20 h-9 bg-background border border-border rounded-sm px-2 text-xs text-foreground outline-none focus:border-primary text-center"
                                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 flex-1">
                                    <span className="text-[10px] text-muted-foreground w-4">Y</span>
                                    <input
                                      type="number"
                                      value={trigger.clickY}
                                      onChange={(e) => updateTrigger(selected.id, trigger.id, { clickY: Number(e.target.value) })}
                                      className="w-20 h-9 bg-background border border-border rounded-sm px-2 text-xs text-foreground outline-none focus:border-primary text-center"
                                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">пикселей от угла экрана</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── REPEAT TAB ── */}
              {activeTab === "repeat" && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground mb-0.5">Повтор по таймеру</h2>
                      <p className="text-[11px] text-muted-foreground">Макрос будет выполняться автоматически через заданный интервал</p>
                    </div>
                    <button
                      onClick={() => updateRepeat(selected.id, { enabled: !selected.repeat.enabled })}
                      className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-sm border transition-all ${selected.repeat.enabled ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${selected.repeat.enabled ? "bg-primary" : "bg-muted-foreground"}`} />
                      {selected.repeat.enabled ? "Включён" : "Выключен"}
                    </button>
                  </div>

                  <div className={`space-y-5 transition-opacity ${selected.repeat.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>

                    {/* Interval */}
                    <div className="rounded-sm border border-border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icon name="Timer" size={13} className="text-muted-foreground" />
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Интервал</span>
                        </div>
                        <div className="flex items-center gap-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                          <input
                            type="number"
                            min={100}
                            max={60000}
                            value={selected.repeat.intervalMs}
                            onChange={(e) => updateRepeat(selected.id, { intervalMs: Number(e.target.value) })}
                            className="w-20 h-8 bg-muted border border-border rounded-sm px-2 text-xs text-foreground outline-none focus:border-primary text-center"
                          />
                          <span className="text-[11px] text-muted-foreground">мс</span>
                          <span className="text-[10px] text-muted-foreground ml-1">= {(selected.repeat.intervalMs / 1000).toFixed(1)} сек</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={100}
                        max={10000}
                        step={100}
                        value={selected.repeat.intervalMs}
                        onChange={(e) => updateRepeat(selected.id, { intervalMs: Number(e.target.value) })}
                        className="w-full accent-primary h-1"
                      />
                      <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                        <span>0.1 сек</span><span>1 сек</span><span>10 сек</span>
                      </div>
                    </div>

                    {/* Stop condition */}
                    <div className="rounded-sm border border-border p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Icon name="Square" size={13} className="text-muted-foreground" />
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Условие остановки</span>
                      </div>
                      <div className="flex gap-2 mb-4">
                        <button
                          onClick={() => updateRepeat(selected.id, { useCount: false })}
                          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-sm border transition-all ${!selected.repeat.useCount ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                        >
                          <Icon name="Clock" size={12} />
                          По времени
                        </button>
                        <button
                          onClick={() => updateRepeat(selected.id, { useCount: true })}
                          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-sm border transition-all ${selected.repeat.useCount ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                        >
                          <Icon name="Hash" size={12} />
                          По количеству
                        </button>
                      </div>

                      {!selected.repeat.useCount ? (
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground w-28">Длительность</span>
                          <input
                            type="number"
                            min={1}
                            value={selected.repeat.durationSec}
                            onChange={(e) => updateRepeat(selected.id, { durationSec: Number(e.target.value) })}
                            className="w-20 h-8 bg-muted border border-border rounded-sm px-2 text-xs text-foreground outline-none focus:border-primary text-center"
                            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                          />
                          <span className="text-[11px] text-muted-foreground">сек</span>
                          <span className="text-[10px] text-muted-foreground">≈ {Math.floor(selected.repeat.durationSec * 1000 / selected.repeat.intervalMs)} запусков</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground w-28">Количество раз</span>
                          <input
                            type="number"
                            min={1}
                            value={selected.repeat.maxCount}
                            onChange={(e) => updateRepeat(selected.id, { maxCount: Number(e.target.value) })}
                            className="w-20 h-8 bg-muted border border-border rounded-sm px-2 text-xs text-foreground outline-none focus:border-primary text-center"
                            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                          />
                          <span className="text-[11px] text-muted-foreground">раз</span>
                          <span className="text-[10px] text-muted-foreground">≈ {((selected.repeat.maxCount * selected.repeat.intervalMs) / 1000).toFixed(0)} сек</span>
                        </div>
                      )}
                    </div>

                    {/* Run / Stop */}
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => repeatRunning === selected.id ? stopRepeat() : startRepeat(selected.id, selected.repeat)}
                        className={`flex items-center gap-2 text-sm px-6 py-2.5 rounded-sm font-medium transition-all ${repeatRunning === selected.id ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                      >
                        {repeatRunning === selected.id ? (
                          <><Icon name="Square" size={14} />Остановить</>
                        ) : (
                          <><Icon name="Play" size={14} />Запустить повтор</>
                        )}
                      </button>

                      {repeatRunning === selected.id && (
                        <div className="flex items-center gap-4 animate-fade-in" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-primary blink" />
                            <span className="text-xs text-primary font-medium">АКТИВЕН</span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            запусков: <span className="text-foreground">{repeatCount}</span>
                          </span>
                          {!selected.repeat.useCount && (
                            <span className="text-[11px] text-muted-foreground">
                              осталось: <span className="text-foreground">{repeatSecondsLeft} сек</span>
                            </span>
                          )}
                          {selected.repeat.useCount && (
                            <span className="text-[11px] text-muted-foreground">
                              из <span className="text-foreground">{selected.repeat.maxCount}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Icon name="Zap" size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">Выберите макрос или создайте новый</p>
          </div>
        </main>
      )}
    </div>
  );
}