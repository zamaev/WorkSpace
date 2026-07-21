import { useEffect, useRef, useState, type ReactNode } from "react";

// Подтверждение вторым кликом: первый клик «взводит» кнопку (краснеет,
// текст меняется), второй — выполняет. Сбрасывается по уходу мыши или 3с.
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
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    setArmed(false);
  };

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
          timer.current = setTimeout(() => setArmed(false), 3000);
          return;
        }
        disarm();
        onConfirm();
      }}
      onMouseLeave={disarm}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
