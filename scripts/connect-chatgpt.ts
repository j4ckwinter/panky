import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connectChatGPT } from "../apps/server/src/chatgpt/connect.js";
import { loadConfig } from "../apps/server/src/config.js";

const execute = promisify(execFile);
try {
  const config = loadConfig();
  if (!config.CHATGPT_ENABLED)
    throw new Error("Enable CHATGPT_ENABLED=true in apps/server/.env first.");
  console.info(
    "Connect the owner's ChatGPT subscription on this computer. Stop Panky's backend before connecting.",
  );
  await connectChatGPT({
    credentialPath: config.CHATGPT_CREDENTIAL_PATH,
    openBrowser: async (url) => {
      if (process.platform === "win32")
        await execute("rundll32.exe", ["url.dll,FileProtocolHandler", url]);
      else if (process.platform === "darwin") await execute("open", [url]);
      else await execute("xdg-open", [url]);
    },
  });
  console.info(
    "ChatGPT connected. Restart Panky, then select a ChatGPT model from your owner account.",
  );
} catch {
  console.error(
    "ChatGPT could not connect. Check that the prototype is enabled, the backend is stopped, and complete sign-in on this computer. No credentials were printed.",
  );
  process.exitCode = 1;
}
