import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";

function TreePlaceholder() {
  return <p className="text-[13px] text-dim">Дерево — скоро.</p>;
}
function WeekPlaceholder() {
  return <p className="text-[13px] text-dim">Неделя — скоро.</p>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<TreePlaceholder />} />
          <Route path="/week/:date?" element={<WeekPlaceholder />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
