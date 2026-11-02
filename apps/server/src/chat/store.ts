import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type Activity,
  activitySchema,
  type Conversation,
  conversationSchema,
  type Message,
  type Evidence,
  messageSchema,
  type TaskRun,
  taskRunSchema,
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
      CREATE TABLE IF NOT EXISTS task_runs (
        id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id),
        userMessageId TEXT NOT NULL REFERENCES messages(id), assistantMessageId TEXT NOT NULL REFERENCES messages(id),
        status TEXT NOT NULL, error TEXT, createdAt TEXT NOT NULL, finishedAt TEXT
      );
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY, runId TEXT NOT NULL REFERENCES task_runs(id), sequence INTEGER NOT NULL,
        data TEXT NOT NULL, UNIQUE(runId, sequence)
      );
      CREATE INDEX IF NOT EXISTS runs_conversation ON task_runs(conversationId);
      UPDATE messages SET status = 'interrupted' WHERE status = 'streaming';
    `);
    const columns = this.db.prepare("PRAGMA table_info(conversations)").all();
    if (!columns.some((column) => column.name === "ownerId")) {
      this.db.exec(
        "ALTER TABLE conversations ADD COLUMN ownerId TEXT NOT NULL DEFAULT 'owner'",
      );
    }
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS conversations_owner ON conversations(ownerId)",
    );
    const messageColumns = this.db.prepare("PRAGMA table_info(messages)").all();
    if (!messageColumns.some((column) => column.name === "sources")) {
      this.db.exec(
        "ALTER TABLE messages ADD COLUMN sources TEXT NOT NULL DEFAULT '[]'",
      );
    }
    for (const row of this.db
      .prepare("SELECT * FROM task_runs WHERE status = 'running'")
      .all()) {
      const run = taskRunSchema.parse(row);
      const message = this.messages(run.conversationId).find(
        (item) => item.id === run.assistantMessageId,
      );
      if (message)
        this.finishRun(
          run,
          message,
          "interrupted",
          "The backend restarted before this task finished.",
        );
    }
  }

  close() {
    this.db.close();
  }

  conversations(ownerId = "owner"): Conversation[] {
    return this.db
      .prepare(
        "SELECT * FROM conversations WHERE ownerId = ? ORDER BY updatedAt DESC, rowid DESC",
      )
      .all(ownerId)
      .map((row) => conversationSchema.parse(row));
  }

  conversation(id: string): Conversation | undefined {
    const row = this.db
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .get(id);
    return row ? conversationSchema.parse(row) : undefined;
  }

  ownsConversation(id: string, ownerId: string): boolean {
    return Boolean(
      this.db
        .prepare("SELECT id FROM conversations WHERE id = ? AND ownerId = ?")
        .get(id, ownerId),
    );
  }

  createConversation(ownerId = "owner"): Conversation {
    const now = new Date().toISOString();
    const conversation = {
      id: randomUUID(),
      title: "New conversation",
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        "INSERT INTO conversations (id,title,createdAt,updatedAt,ownerId) VALUES (?, ?, ?, ?, ?)",
      )
      .run(conversation.id, conversation.title, now, now, ownerId);
    return conversation;
  }

  renameConversation(id: string, title: string): Conversation {
    this.db
      .prepare("UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?")
      .run(title, new Date().toISOString(), id);
    const conversation = this.conversation(id);
    if (!conversation) throw new Error("Conversation not found.");
    return conversation;
  }

  deleteConversation(id: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM activities WHERE runId IN (SELECT id FROM task_runs WHERE conversationId = ?)",
        )
        .run(id);
      this.db.prepare("DELETE FROM task_runs WHERE conversationId = ?").run(id);
      this.db.prepare("DELETE FROM messages WHERE conversationId = ?").run(id);
      this.db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  messages(id: string): Message[] {
    return this.db
      .prepare("SELECT * FROM messages WHERE conversationId = ? ORDER BY rowid")
      .all(id)
      .map((row) =>
        messageSchema.parse({
          ...row,
          sources: JSON.parse(String(row.sources)),
        }),
      );
  }

  beginResponse(
    conversationId: string,
    content: string,
    sources: Evidence[] = [],
  ): { user: Message; assistant: Message; run: TaskRun } {
    const now = new Date().toISOString();
    const user: Message = {
      id: randomUUID(),
      conversationId,
      role: "user",
      content,
      status: "completed",
      createdAt: now,
      sources: [],
    };
    const assistant: Message = {
      id: randomUUID(),
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: now,
      sources,
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const firstMessage = this.messages(conversationId).length === 0;
      const insert = this.db.prepare(
        "INSERT INTO messages (id,conversationId,role,content,status,createdAt,sources) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const message of [user, assistant])
        insert.run(
          message.id,
          conversationId,
          message.role,
          message.content,
          message.status,
          now,
          JSON.stringify(message.sources),
        );
      if (
        firstMessage &&
        this.conversation(conversationId)?.title === "New conversation"
      ) {
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
      const run: TaskRun = {
        id: randomUUID(),
        conversationId,
        userMessageId: user.id,
        assistantMessageId: assistant.id,
        status: "running",
        error: null,
        createdAt: now,
        finishedAt: null,
      };
      this.db
        .prepare("INSERT INTO task_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(
          run.id,
          conversationId,
          user.id,
          assistant.id,
          run.status,
          null,
          now,
          null,
        );
      this.db.exec("COMMIT");
      return { user, assistant, run };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  runs(conversationId: string): TaskRun[] {
    return this.db
      .prepare(
        "SELECT * FROM task_runs WHERE conversationId = ? ORDER BY rowid",
      )
      .all(conversationId)
      .map((row) => taskRunSchema.parse(row));
  }

  run(id: string): TaskRun | undefined {
    const row = this.db.prepare("SELECT * FROM task_runs WHERE id = ?").get(id);
    return row ? taskRunSchema.parse(row) : undefined;
  }

  activities(conversationId: string): Activity[] {
    return this.db
      .prepare(
        "SELECT data FROM activities WHERE runId IN (SELECT id FROM task_runs WHERE conversationId = ?) ORDER BY rowid",
      )
      .all(conversationId)
      .map((row) => activitySchema.parse(JSON.parse(String(row.data))));
  }

  addActivity(runId: string, event: ActivityPayload): Activity {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM activities WHERE runId = ?")
      .get(runId);
    const activity = activitySchema.parse({
      ...event,
      id: randomUUID(),
      runId,
      sequence: Number(row?.count ?? 0),
      createdAt: new Date().toISOString(),
    });
    this.db
      .prepare("INSERT INTO activities VALUES (?, ?, ?, ?)")
      .run(activity.id, runId, activity.sequence, JSON.stringify(activity));
    return activity;
  }

  finishRun(
    run: TaskRun,
    message: Message,
    status: Exclude<TaskRun["status"], "running">,
    error: string | null,
  ): Activity {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      message.status = status === "completed" ? "completed" : "interrupted";
      this.saveMessage(message);
      run.status = status;
      run.error = error;
      run.finishedAt = new Date().toISOString();
      this.db
        .prepare(
          "UPDATE task_runs SET status = ?, error = ?, finishedAt = ? WHERE id = ?",
        )
        .run(status, error, run.finishedAt, run.id);
      const activity = this.addActivity(run.id, {
        kind: "run_finished",
        status,
        error,
      });
      this.db.exec("COMMIT");
      return activity;
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

type Payload<T> = T extends Activity
  ? Omit<T, "id" | "runId" | "sequence" | "createdAt">
  : never;
export type ActivityPayload = Payload<Activity>;
