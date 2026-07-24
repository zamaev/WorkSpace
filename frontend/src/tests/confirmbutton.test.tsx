// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmButton } from "../components/ConfirmButton";

afterEach(cleanup);

describe("ConfirmButton — попап подтверждения удаления", () => {
  it("клик открывает попап, «Удалить» вызывает onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton message="Удалить проект?" onConfirm={onConfirm}>
        <span>🗑</span>
      </ConfirmButton>,
    );
    // до клика попапа нет — удалить нечем
    expect(screen.queryByText("Удалить проект?")).toBeNull();
    fireEvent.click(screen.getByText("🗑"));
    expect(screen.getByText("Удалить проект?")).toBeDefined();
    fireEvent.click(screen.getByText("Удалить"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("«Отмена» закрывает попап и ничего не удаляет", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton message="Удалить?" onConfirm={onConfirm}>
        <span>del</span>
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByText("del"));
    fireEvent.click(screen.getByText("Отмена"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText("Удалить?")).toBeNull();
  });

  it("двойной клик по корзине не удаляет — только открыл и закрыл попап", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton message="Удалить?" onConfirm={onConfirm}>
        <span>del</span>
      </ConfirmButton>,
    );
    const trigger = screen.getByText("del");
    fireEvent.click(trigger); // мышечная память: клик…
    fireEvent.click(trigger); // …и ещё клик по тому же месту
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText("Удалить?")).toBeNull();
  });
});
