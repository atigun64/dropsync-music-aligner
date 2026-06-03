import { Routes, Route, Navigate } from "react-router-dom";
import MainPage from "./pages/MainPage";
import StudioPage from "./pages/StudioPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/studios/:studioId" element={<StudioPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
