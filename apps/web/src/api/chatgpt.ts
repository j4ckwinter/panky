import { chatGPTConnectionSchema, chatGPTModelsSchema } from "@panky/shared";

type Request = (path: string, init?: RequestInit) => Promise<Response>;
const root = "/connections/chatgpt";
export function chatGPTApi(request: Request) {
  return {
    async chatGPTConnection(signal?: AbortSignal) {
      return chatGPTConnectionSchema.parse(
        await (await request(root, { signal })).json(),
      );
    },
    async chatGPTModels(signal?: AbortSignal) {
      return chatGPTModelsSchema.parse(
        await (await request(`${root}/models`, { signal })).json(),
      );
    },
    async disconnectChatGPT() {
      await request(root, { method: "DELETE" });
    },
  };
}
