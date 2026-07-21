import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { DataProvider } from "./data/DataProvider";
import { TreeView } from "./tree/TreeView";
import { WeekView } from "./week/WeekView";

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<TreeView />} />
            <Route path="/week/:date?" element={<WeekView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </DataProvider>
    </BrowserRouter>
  );
}
