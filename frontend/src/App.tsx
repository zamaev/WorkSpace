import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { DataProvider } from "./data/DataProvider";
import { TreeView } from "./tree/TreeView";

function WeekPlaceholder() {
  return <p className="text-[13px] text-dim">Неделя — скоро.</p>;
}

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<TreeView />} />
            <Route path="/week/:date?" element={<WeekPlaceholder />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </DataProvider>
    </BrowserRouter>
  );
}
