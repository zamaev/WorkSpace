import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnchoredPopover } from "./AnchoredPopover";
import { NavLink, useNavigate } from "react-router-dom";

function applyTheme(theme: "dark" | "light") {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("workspace-theme", theme);
  } catch {
    // приватный режим — тема просто не переживёт перезагрузку
  }
}

function initialTheme(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

// Хоткеи глобальные, но не должны срабатывать при наборе текста.
function typingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

export function Shell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">(initialTheme);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "1") navigate("/projects");
      if (e.key === "2") navigate("/week");
      if (e.key === "3") navigate("/gantt");
      if (e.key === "4") navigate("/team");
      if (e.key === "5") navigate("/types");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="mlabel mlabel-accent">WORKSPACE</div>
        <nav className="flex gap-2">
          <NavLink to="/projects" title="Проекты — клавиша 1" className={({ isActive }) => `seg ${isActive ? "seg-on" : ""}`}>
            Проекты
          </NavLink>
          <NavLink to="/week" title="Неделя — клавиша 2" className={({ isActive }) => `seg ${isActive ? "seg-on" : ""}`}>
            Неделя
          </NavLink>
          <NavLink to="/gantt" title="Гант — клавиша 3" className={({ isActive }) => `seg ${isActive ? "seg-on" : ""}`}>
            Гант
          </NavLink>
          <NavLink to="/team" title="Команда — клавиша 4" className={({ isActive }) => `seg ${isActive ? "seg-on" : ""}`}>
            Команда
          </NavLink>
          <NavLink to="/types" title="Типы — клавиша 5" className={({ isActive }) => `seg ${isActive ? "seg-on" : ""}`}>
            Типы
          </NavLink>
        </nav>
        <div className="flex gap-2">
          <button
            ref={helpRef}
            type="button"
            className="icon-btn"
            title="Подсказки"
            aria-label="Подсказки"
            onClick={() => setHelpOpen((v) => !v)}
          >
            ?
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
        {helpOpen && (
          <AnchoredPopover anchorRef={helpRef} onClose={() => setHelpOpen(false)}>
            <div className="w-[280px] flex flex-col gap-2 text-[12.5px]">
              <div className="mlabel">Клавиши</div>
              <div className="flex flex-col gap-1">
                <span><span className="mmeta">1–5</span> — Проекты · Неделя · Гант · Команда · Типы</span>
                <span><span className="mmeta">T</span> — текущая неделя (в «Неделе»)</span>
                <span><span className="mmeta">Esc</span> — закрыть попап/модал</span>
              </div>
              <div className="mlabel pt-1">Жесты</div>
              <div className="flex flex-col gap-1">
                <span>Двойной клик по названию — переименовать</span>
                <span>Удаление: первый клик — «точно?», второй — удалить</span>
                <span>Дерево: тащи строку — середина «внутрь», край — рядом</span>
                <span>Задачу можно бросить на проект в сайдбаре</span>
                <span>Гант: полосу — двигать, края — тянуть, ромб/флажок — тоже</span>
                <span>Границы колонок в «Проектах» перетаскиваются</span>
              </div>
            </div>
          </AnchoredPopover>
        )}
      </header>
      {children}
    </div>
  );
}
