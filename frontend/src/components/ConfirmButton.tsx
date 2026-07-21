import { useEffect, useRef, useState, type ReactNode } from "react";

// Подтверждение вторым кликом: первый клик «взводит» кнопку (краснеет,
// текст меняется), второй — выполняет. Сброс — только по таймеру или
// Escape: сброс по уходу мыши делал паттерн хрупким (реальная мышь между
// кликами почти всегда чуть уходит с кнопки, и подтверждение тихо
// слеталo — «задачи не удаляются»).
export function ConfirmButton({
  children,
  confirmLabel = "точно?",
  className = "",
  armedClassName = "",
  title,
  onConfirm,
}: {
  children: ReactNode;
  confirmLabel?: ReactNode;
  className?: string;
  armedClassName?: string;
  title?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [armed]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <button
      type="button"
      className={`${className} ${armed ? armedClassName : ""}`}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        if (!armed) {
          setArmed(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setArmed(false), 4000);
          return;
        }
        if (timer.current) clearTimeout(timer.current);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
