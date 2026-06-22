import { Routes, Route, Navigate } from "react-router-dom";
import MainPage from "./pages/MainPage";
import StudioPage from "./pages/StudioPage";
import { AppDialogProvider } from "./components/shared/AppDialogProvider";

export default function App() {
  return (
    <AppDialogProvider>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/studios/:studioId" element={<StudioPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppDialogProvider>
  );
}
