import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app can be dropped on any static host or opened
  // from a subfolder — small museums rarely control a domain root.
  base: "./",
  assetsInclude: ["**/*.yaml"],
});
