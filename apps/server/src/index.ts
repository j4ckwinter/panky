import { loadConfig } from "./config.js";
import { createApp } from "./http.js";

try {
  const config = loadConfig();
  const app = createApp(config);
  app.server.on("error", () => {
    console.error(
      "Panky could not start its HTTP server. Check the host and port.",
    );
    process.exitCode = 1;
    app.store.close();
  });
  app.server.listen(config.PORT, config.HOST, () => {
    console.info(
      `Panky backend listening on ${config.HOST}:${config.PORT} (mock provider).`,
    );
  });
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      void app
        .close()
        .then(() => {
          process.exitCode = 0;
        })
        .catch(() => {
          process.exitCode = 1;
        });
    });
  }
} catch (error) {
  console.error(
    error instanceof Error &&
      error.message.startsWith("Invalid server configuration:")
      ? error.message
      : "Panky could not initialize its database or server.",
  );
  process.exitCode = 1;
}
