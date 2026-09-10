import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const host = env.VITE_BLOCKS_DEV_HOST || "localhost";
  const port = Number(env.VITE_BLOCKS_DEV_PORT) || 5173;
  const keyPath = new URL("./.cert/dev-key.pem", import.meta.url);
  const certPath = new URL("./.cert/dev-cert.pem", import.meta.url);
  const hasCertificate = existsSync(keyPath) && existsSync(certPath);

  return {
    plugins: [react()],
    resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
    server: {
      host: true,
      port,
      strictPort: true,
      https: hasCertificate ? { key: readFileSync(keyPath), cert: readFileSync(certPath) } : undefined,
      allowedHosts: host === "localhost" ? undefined : [host],
      ws: {
        host,
        port,
        clientPort: port,
        protocol: hasCertificate ? "wss" : "ws",
      },
    },
  };
});
