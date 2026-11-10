import { Navigate, Route, Routes } from "react-router-dom";
import { Auth } from "./pages/Auth";
import { Feed } from "./pages/Feed";
import { Collections } from "./pages/Collections";
import { CollectionDetail } from "./pages/CollectionDetail";
import { Library } from "./pages/Library";
import { BookDetail } from "./pages/BookDetail";
import { Snippets } from "./pages/Snippets";
import { Repos } from "./pages/Repos";
import { Discover } from "./pages/Discover";
import { Profile } from "./pages/Profile";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";

export function App() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/recuperar" element={<ForgotPassword />} />
      <Route path="/restablecer" element={<ResetPassword />} />
      <Route path="/" element={<Feed />} />
      <Route path="/colecciones" element={<Collections />} />
      <Route path="/colecciones/:id" element={<CollectionDetail />} />
      <Route path="/biblioteca" element={<Library />} />
      <Route path="/biblioteca/:id" element={<BookDetail />} />
      <Route path="/snippets" element={<Snippets />} />
      <Route path="/repositorios" element={<Repos />} />
      <Route path="/descubrir" element={<Discover />} />
      <Route path="/perfil" element={<Profile />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
