import { useEffect, useState, type ReactNode } from "react";
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
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "1") navigate("/projects");
      if (e.key === "2") navigate("/week");
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
          <NavLink to="/projects" className={({ isActive }) => `seg ${isActive ? "seg-on" : ""}`}>
            Проекты
          </NavLink>
          <NavLink to="/week" className={({ isActive }) => `seg ${isActive ? "seg-on" : ""}`}>
            Неделя
          </NavLink>
        </nav>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </header>
      {children}
    </div>
  );
}
