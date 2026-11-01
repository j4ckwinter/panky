import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type Conversation,
  conversationSchema,
  type Message,
  messageSchema,
} from "@panky/shared";

export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')), content TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('streaming', 'completed', 'interrupted')), createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversationId);
      UPDATE messages SET status = 'interrupted' WHERE status = 'streaming';
    `);
  }

  close() {
    this.db.close();
  }

  conversations(): Conversation[] {
    return this.db
      .prepare(
        "SELECT * FROM conversations ORDER BY updatedAt DESC, rowid DESC",
      )
      .all()
      .map((row) => conversationSchema.parse(row));
  }

  conversation(id: string): Conversation | undefined {
    const row = this.db
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .get(id);
    return row ? conversationSchema.parse(row) : undefined;
  }

  createConversation(): Conversation {
    const now = new Date().toISOString();
    const conversation = {
      id: randomUUID(),
      title: "New conversation",
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare("INSERT INTO conversations VALUES (?, ?, ?, ?)")
      .run(conversation.id, conversation.title, now, now);
    return conversation;
  }

  messages(id: string): Message[] {
    return this.db
      .prepare("SELECT * FROM messages WHERE conversationId = ? ORDER BY rowid")
      .all(id)
      .map((row) => messageSchema.parse(row));
  }

  beginResponse(
    conversationId: string,
    content: string,
  ): { user: Message; assistant: Message } {
    const now = new Date().toISOString();
    const user: Message = {
      id: randomUUID(),
      conversationId,
      role: "user",
      content,
      status: "completed",
      createdAt: now,
    };
    const assistant: Message = {
      id: randomUUID(),
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: now,
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const firstMessage = this.messages(conversationId).length === 0;
      const insert = this.db.prepare(
        "INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const message of [user, assistant])
        insert.run(
          message.id,
          conversationId,
          message.role,
          message.content,
          message.status,
          now,
        );
      if (firstMessage) {
        this.db
          .prepare(
            "UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?",
          )
          .run(content.slice(0, 60), now, conversationId);
      } else {
        this.db
          .prepare("UPDATE conversations SET updatedAt = ? WHERE id = ?")
          .run(now, conversationId);
      }
      this.db.exec("COMMIT");
      return { user, assistant };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  saveMessage(message: Message) {
    this.db
      .prepare("UPDATE messages SET content = ?, status = ? WHERE id = ?")
      .run(message.content, message.status, message.id);
  }
}
