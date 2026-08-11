import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

/**
 * `npm run dev` serves plain HTTP - fine on a laptop.
 *
 * `npm run dev:https` adds a self-signed certificate. Needed on a phone or iPad
 * for anything beyond the basics: Add to Home Screen, the service worker, and
 * later the microphone all require a secure context. Safari will warn about the
 * certificate; accept it once per device.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "https" ? [basicSsl()] : [])],
  // Relative base so the built app can be dropped on any static host or opened
  // from a subfolder - small museums rarely control a domain root.
  base: "./",
  assetsInclude: ["**/*.yaml"],
  server: { host: true },
}));
