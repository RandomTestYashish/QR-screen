import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  // Relative asset URLs, so the same build works at a domain root, in a
  // GitHub Pages project subfolder (/QR-screen/), or opened from disk.
  base: "./",
  build: {
    // Inline the avatar as a data URI rather than emitting a separate file,
    // so the single-file artifact build stays a single file.
    assetsInlineLimit: 24000,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
