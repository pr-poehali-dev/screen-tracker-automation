import { useState, useCallback, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";

type StepType = "key" | "delay" | "text";

interface Step {
  id: string;
  type: StepType;
  value: string;
}

interface Macro {
  id: string;
  name: string;
  hotkey: string;
  enabled: boolean;
  steps: Step[];
  runCount: number;
}

const initialMacros: Macro[] = [
  {
    id: "1",
    name: "Сохранить документ",
    hotkey: "Ctrl+Shift+S",
    enabled: true,
    runCount: 42,
    steps: [
      { id: "s1", type: "key", value: "Ctrl+S" },
      { id: "s2", type: "delay", value: "500" },
      { id: "s3", type: "key", value: "Enter" },
    ],
  },
  {
    id: "2",
    name: "Открыть терминал",
    hotkey: "Ctrl+Alt+T",
    enabled: true,
    runCount: 17,
    steps: [
      { id: "s4", type: "key", value: "Win+R" },
      { id: "s5", type: "delay", value: "300" },
      { id: "s6", type: "text", value: "cmd" },
      { id: "s7", type: "key", value: "Enter" },
    ],
  },
  {
    id: "3",
    name: "Скриншот экрана",
    hotkey: "Ctrl+Shift+P",
    enabled: false,
    runCount: 5,
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

export default function Index() {
  const [macros, setMacros] = useState<Macro[]>(initialMacros);
  const [selectedId, setSelectedId] = useState<string | null>("1");
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [recordingTarget, setRecordingTarget] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showNewStep, setShowNewStep] = useState(false);
  const [newStepType, setNewStepType] = useState<StepType>("key");
  const [newStepValue, setNewStepValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selected = macros.find((m) => m.id === selectedId) ?? null;

  const updateMacro = useCallback((id: string, patch: Partial<Macro>) => {
    setMacros((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const addMacro = () => {
    const id = generateId();
    const newMacro: Macro = {
      id,
      name: "Новый макрос",
      hotkey: "",
      enabled: true,
      runCount: 0,
      steps: [],
    };
    setMacros((ms) => [...ms, newMacro]);
    setSelectedId(id);
  };

  const deleteMacro = (id: string) => {
    const remaining = macros.filter((m) => m.id !== id);
    setMacros(remaining);
    if (selectedId === id) {
      setSelectedId(remaining[0]?.id ?? null);
    }
  };

  const runMacro = (id: string) => {
    setRunningId(id);
    setMacros((ms) =>
      ms.map((m) => (m.id === id ? { ...m, runCount: m.runCount + 1 } : m))
    );
    setTimeout(() => setRunningId(null), 1200);
  };

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
      if (!["Control", "Alt", "Shift", "Meta"].includes(key)) {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
      }
      if (parts.length > 0 && recordingTarget) {
        updateMacro(recordingTarget, { hotkey: parts.join("+") });
      }
      setIsRecordingHotkey(false);
      setRecordingTarget(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRecordingHotkey, recordingTarget, updateMacro]);

  const startEditName = (macro: Macro) => {
    setEditingName(macro.id);
    setNameValue(macro.name);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    if (editingName && nameValue.trim()) {
      updateMacro(editingName, { name: nameValue.trim() });
    }
    setEditingName(null);
  };

  const deleteStep = (macroId: string, stepId: string) => {
    setMacros((ms) =>
      ms.map((m) =>
        m.id === macroId
          ? { ...m, steps: m.steps.filter((s) => s.id !== stepId) }
          : m
      )
    );
  };

  const addStep = () => {
    if (!selectedId || !newStepValue.trim()) return;
    const step: Step = {
      id: generateId(),
      type: newStepType,
      value: newStepValue.trim(),
    };
    setMacros((ms) =>
      ms.map((m) =>
        m.id === selectedId ? { ...m, steps: [...m.steps, step] } : m
      )
    );
    setNewStepValue("");
    setShowNewStep(false);
  };

  return (
    <div
      className="flex h-screen bg-background text-foreground overflow-hidden"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      {/* Sidebar */}
      <aside className="w-64 border-r border-border flex flex-col" style={{ background: "hsl(220, 13%, 7%)" }}>
        {/* Logo */}
        <div className="px-5 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <Icon name="Zap" size={14} className="text-primary-foreground" />
            </div>
            <span
              className="text-sm font-semibold tracking-wide text-foreground"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              MacroFlow
            </span>
          </div>
        </div>

        {/* Macro list */}
        <div className="flex-1 overflow-y-auto py-3 px-2">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              Макросы
            </span>
            <button
              onClick={addMacro}
              className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
            >
              <Icon name="Plus" size={13} />
            </button>
          </div>

          <div className="space-y-0.5">
            {macros.map((macro) => (
              <button
                key={macro.id}
                onClick={() => setSelectedId(macro.id)}
                className={`w-full text-left px-3 py-2.5 rounded-sm macro-card border transition-all ${
                  selectedId === macro.id
                    ? "active border-primary/40"
                    : "border-transparent"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          macro.enabled ? "bg-primary" : "bg-muted-foreground"
                        }`}
                      />
                      <span className="text-xs font-medium truncate text-foreground">
                        {macro.name}
                      </span>
                    </div>
                    {macro.hotkey && (
                      <span className="kbd-tag ml-3">{macro.hotkey}</span>
                    )}
                  </div>
                  {runningId === macro.id && (
                    <Icon
                      name="Loader"
                      size={12}
                      className="text-primary animate-spin mt-0.5 flex-shrink-0"
                    />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Stats footer */}
        <div className="px-5 py-3 border-t border-border">
          <div className="text-[10px] text-muted-foreground">
            <span className="text-foreground font-medium">
              {macros.filter((m) => m.enabled).length}
            </span>{" "}
            активных &nbsp;·&nbsp;{" "}
            <span className="text-foreground font-medium">
              {macros.reduce((a, m) => a + m.runCount, 0)}
            </span>{" "}
            запусков
          </div>
        </div>
      </aside>

      {/* Main panel */}
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
                  style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                />
              ) : (
                <button
                  onClick={() => startEditName(selected)}
                  className="text-lg font-semibold text-foreground hover:text-primary transition-colors group flex items-center gap-2"
                >
                  {selected.name}
                  <Icon
                    name="Pencil"
                    size={13}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </button>
              )}
              <span
                className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-sm"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {selected.steps.length} шагов
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Toggle */}
              <button
                onClick={() =>
                  updateMacro(selected.id, { enabled: !selected.enabled })
                }
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-sm border transition-all ${
                  selected.enabled
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    selected.enabled ? "bg-primary" : "bg-muted-foreground"
                  }`}
                />
                {selected.enabled ? "Включён" : "Выключен"}
              </button>

              {/* Run */}
              <button
                onClick={() => runMacro(selected.id)}
                disabled={runningId === selected.id}
                className="flex items-center gap-2 text-xs px-4 py-1.5 rounded-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {runningId === selected.id ? (
                  <>
                    <Icon name="Loader" size={13} className="animate-spin" />
                    Выполняется
                  </>
                ) : (
                  <>
                    <Icon name="Play" size={13} />
                    Запустить
                  </>
                )}
              </button>

              {/* Delete */}
              <button
                onClick={() => deleteMacro(selected.id)}
                className="w-8 h-8 flex items-center justify-center rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-8 py-8">
              {/* Hotkey section */}
              <section className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="Keyboard" size={13} className="text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                    Горячая клавиша
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-10 flex items-center px-3 rounded-sm border border-border bg-card">
                    {selected.hotkey ? (
                      <span className="kbd-tag text-sm">{selected.hotkey}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        Не назначена
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => startRecordingHotkey(selected.id)}
                    className={`px-4 h-10 text-xs rounded-sm border transition-all font-medium ${
                      isRecordingHotkey && recordingTarget === selected.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {isRecordingHotkey && recordingTarget === selected.id ? (
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary blink" />
                        Нажмите клавишу...
                      </span>
                    ) : (
                      "Записать"
                    )}
                  </button>
                  {selected.hotkey && (
                    <button
                      onClick={() => updateMacro(selected.id, { hotkey: "" })}
                      className="w-10 h-10 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                    >
                      <Icon name="X" size={13} />
                    </button>
                  )}
                </div>
              </section>

              {/* Steps section */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon name="ListOrdered" size={13} className="text-muted-foreground" />
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                      Шаги выполнения
                    </span>
                  </div>
                  <button
                    onClick={() => setShowNewStep(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Icon name="Plus" size={12} />
                    Добавить
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
                        <div
                          key={step.id}
                          className="step-row flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 group"
                        >
                          <span
                            className="w-5 text-right text-[10px] text-muted-foreground flex-shrink-0"
                            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <div
                            className={`flex items-center gap-1.5 w-24 flex-shrink-0 ${STEP_TYPE_COLORS[step.type]}`}
                          >
                            <Icon name={STEP_TYPE_ICONS[step.type]} fallback="Circle" size={12} />
                            <span className="text-[10px] uppercase tracking-wider font-medium">
                              {STEP_TYPE_LABELS[step.type]}
                            </span>
                          </div>
                          <div className="flex-1">
                            {step.type === "delay" ? (
                              <span
                                className="text-xs text-foreground"
                                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                              >
                                {step.value} мс
                              </span>
                            ) : (
                              <span className="kbd-tag">{step.value}</span>
                            )}
                          </div>
                          <button
                            onClick={() => deleteStep(selected.id, step.id)}
                            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Icon name="X" size={12} />
                          </button>
                        </div>
                      ))}

                      {/* New step form */}
                      {showNewStep && (
                        <div className="flex items-center gap-3 px-4 py-3 border-t border-border animate-fade-in" style={{ background: "hsl(220,13%,12%)" }}>
                          <span
                            className="w-5 text-right text-[10px] text-muted-foreground flex-shrink-0"
                            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {String(selected.steps.length + 1).padStart(2, "0")}
                          </span>
                          <select
                            value={newStepType}
                            onChange={(e) =>
                              setNewStepType(e.target.value as StepType)
                            }
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
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addStep();
                              if (e.key === "Escape") setShowNewStep(false);
                            }}
                            placeholder={
                              newStepType === "key"
                                ? "Ctrl+C"
                                : newStepType === "delay"
                                ? "500"
                                : "введите текст..."
                            }
                            className="flex-1 bg-transparent border-b border-border text-xs text-foreground outline-none focus:border-primary pb-0.5 placeholder:text-muted-foreground"
                            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                          />
                          <button
                            onClick={addStep}
                            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                          >
                            ↵
                          </button>
                          <button
                            onClick={() => setShowNewStep(false)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Icon name="X" size={12} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>

              {/* Meta */}
              <div
                className="mt-6 flex items-center gap-6 text-[10px] text-muted-foreground"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <span>
                  запусков:{" "}
                  <span className="text-foreground">{selected.runCount}</span>
                </span>
                <span>
                  id: <span className="text-foreground">{selected.id}</span>
                </span>
              </div>
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