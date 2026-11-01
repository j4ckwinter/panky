import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const target =
    env.PANKY_API_TARGET || env.VITE_API_URL || "http://127.0.0.1:3001";
  const url = new URL(target);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.origin !== target
  )
    throw new Error(
      "PANKY_API_TARGET must be an HTTPS origin or a loopback HTTP origin.",
    );
  const proxy = {
    "/api": {
      target,
      changeOrigin: true,
      headers: { "ngrok-skip-browser-warning": "1" },
    },
  };
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy },
    preview: { proxy },
  };
});
