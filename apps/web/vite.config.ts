import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: {
    // Same routes as Caddy in production. /api/auth must come before /api.
    proxy: {
      "/api/auth": "http://localhost:3001",
      "/api": "http://localhost:8080",
    },
  },
})
