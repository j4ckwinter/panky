export type ConnectionId = "notion" | "chatgpt";
export type ConnectionItem = {
  id: ConnectionId;
  name: string;
  description: string;
  mark: string | { src: string };
};
const notion: ConnectionItem = {
  id: "notion",
  name: "Notion",
  description: "Your notes, projects and experience.",
  mark: "N",
};
const chatGPT: ConnectionItem = {
  id: "chatgpt",
  name: "ChatGPT",
  description: "Use your ChatGPT plan for answers.",
  mark: { src: "/icons/chatgpt.svg" },
};
export function connectionCatalogue(showChatGPT: boolean): ConnectionItem[] {
  return showChatGPT ? [notion, chatGPT] : [notion];
}
