import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El proxy deja el frontend y la API en el mismo origen durante el desarrollo,
// así la cookie de sesión viaja sin líos de CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
