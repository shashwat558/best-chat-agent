import { and, desc, eq } from "drizzle-orm";
import { db } from "./db/client";
import {
  conversations,
  messages,
  userProfiles,
  type Message,
  type StoredMessagePart,
} from "./db/schema";

type ConversationInput = Readonly<{
  conversationId: string;
  userId: string;
  firstMessage: string;
}>;

export async function authorizeOrCreateConversation({
  conversationId,
  userId,
  firstMessage,
}: ConversationInput): Promise<boolean> {
  await db
    .insert(conversations)
    .values({
      id: conversationId,
      userId,
      title: firstMessage.slice(0, 80),
    })
    .onConflictDoNothing({ target: conversations.id });

  const [conversation] = await db
    .select({ userId: conversations.userId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  return conversation?.userId === userId;
}

export async function ownsConversation(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    )
    .limit(1);

  return Boolean(conversation);
}

export async function saveUserMessage(input: {
  conversationId: string;
  userId: string;
  content: string;
}): Promise<Message> {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      userId: input.userId,
      role: "user",
      content: input.content,
      parts: [{ type: "text", text: input.content }],
    })
    .returning();

  if (!message) {
    throw new Error("User message was not persisted");
  }

  return message;
}

export async function saveAssistantMessage(input: {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  parts: StoredMessagePart[];
}): Promise<void> {
  await db.insert(messages).values({
    id: input.id,
    conversationId: input.conversationId,
    userId: input.userId,
    role: "assistant",
    content: input.content,
    parts: input.parts,
  });

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.userId, input.userId),
      ),
    );
}

export async function loadRecentMessages(
  conversationId: string,
  userId: string,
  limit = 12,
): Promise<Message[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.userId, userId),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);

  return rows.reverse();
}

export async function loadConversationMessages(
  conversationId: string,
  userId: string,
): Promise<Message[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.userId, userId),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id));

  return rows.reverse();
}

export async function upsertUserTimezone(
  userId: string,
  timezone: string,
): Promise<void> {
  await db
    .insert(userProfiles)
    .values({ userId, timezone })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { timezone, updatedAt: new Date() },
    });
}
