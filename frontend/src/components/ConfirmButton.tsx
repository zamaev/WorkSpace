import { useRef, useState, type ReactNode } from "react";
import { AnchoredPopover } from "./AnchoredPopover";

// Удаление через попап-подтверждение: клик по кнопке открывает поповер с
// вопросом и кнопками «Отмена / Удалить». Кнопка подтверждения появляется
// НЕ на месте триггера (поповер снизу), поэтому привычный «двойной клик»
// по корзине не удаляет случайно — второй клик по триггеру просто закрывает
// поповер. onConfirm вызывается только по явному «Удалить».
export function ConfirmButton({
  children,
  message,
  confirmLabel = "Удалить",
  className = "",
  title,
  onConfirm,
}: {
  children: ReactNode;
  message: ReactNode;
  confirmLabel?: ReactNode;
  className?: string;
  title?: string;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {children}
      </button>
      {open && (
        <AnchoredPopover anchorRef={ref} onClose={() => setOpen(false)}>
          <div className="confirm-pop">
            <p className="confirm-pop-msg">{message}</p>
            <div className="confirm-pop-actions">
              <button
                type="button"
                className="seg"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="seg confirm-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onConfirm();
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </AnchoredPopover>
      )}
    </>
  );
}
