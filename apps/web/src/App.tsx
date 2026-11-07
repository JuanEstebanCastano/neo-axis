import { Navigate, Route, Routes } from "react-router-dom";
import { Auth } from "./pages/Auth";
import { Feed } from "./pages/Feed";
import { Collections } from "./pages/Collections";
import { CollectionDetail } from "./pages/CollectionDetail";
import { Library } from "./pages/Library";
import { BookDetail } from "./pages/BookDetail";
import { Snippets } from "./pages/Snippets";
import { Discover } from "./pages/Discover";

export function App() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={<Feed />} />
      <Route path="/colecciones" element={<Collections />} />
      <Route path="/colecciones/:id" element={<CollectionDetail />} />
      <Route path="/biblioteca" element={<Library />} />
      <Route path="/biblioteca/:id" element={<BookDetail />} />
      <Route path="/snippets" element={<Snippets />} />
      <Route path="/descubrir" element={<Discover />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
