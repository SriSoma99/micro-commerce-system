import crypto from "node:crypto";
import { getDb } from "../db/database";
import type { AiMessage, AiPersona } from "../platform/ai/types";

export interface AiConversationRecord {
  id: string;
  customerId: string | null;
  persona: AiPersona;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageRecord {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallsJson: string | null;
  toolResultsJson: string | null;
  createdAt: string;
}

export interface AiActionDraftRecord {
  id: string;
  conversationId: string | null;
  customerId: string;
  actionType: "refund" | "reschedule" | "transfer";
  parametersJson: string;
  reason: string;
  riskScore: number;
  status: "pending" | "approved" | "rejected";
  supervisorId: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export const aiRepository = {
  createConversation(data: { customerId?: string; persona: AiPersona; title: string }): AiConversationRecord {
    const db = getDb();
    const id = `conv_${crypto.randomBytes(8).toString("hex")}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO ai_conversations (id, customer_id, persona, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.customerId ?? null, data.persona, data.title, now, now);

    return {
      id,
      customerId: data.customerId ?? null,
      persona: data.persona,
      title: data.title,
      createdAt: now,
      updatedAt: now
    };
  },

  getConversation(id: string): AiConversationRecord | null {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM ai_conversations WHERE id = ?`).get(id) as {
      id: string;
      customer_id: string | null;
      persona: AiPersona;
      title: string;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return null;
    return {
      id: row.id,
      customerId: row.customer_id,
      persona: row.persona,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  listConversations(customerId?: string): AiConversationRecord[] {
    const db = getDb();
    let sql = `SELECT * FROM ai_conversations`;
    const params: string[] = [];

    if (customerId) {
      sql += ` WHERE customer_id = ?`;
      params.push(customerId);
    }
    sql += ` ORDER BY updated_at DESC LIMIT 50`;

    const rows = db.prepare(sql).all(...params) as {
      id: string;
      customer_id: string | null;
      persona: AiPersona;
      title: string;
      created_at: string;
      updated_at: string;
    }[];

    return rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      persona: r.persona,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  },

  addMessage(data: { conversationId: string; role: AiMessage["role"]; content: string; toolCalls?: unknown; toolResults?: unknown }): AiMessageRecord {
    const db = getDb();
    const id = `msg_${crypto.randomBytes(8).toString("hex")}`;
    const now = new Date().toISOString();
    const toolCallsJson = data.toolCalls ? JSON.stringify(data.toolCalls) : null;
    const toolResultsJson = data.toolResults ? JSON.stringify(data.toolResults) : null;

    db.prepare(`
      INSERT INTO ai_messages (id, conversation_id, role, content, tool_calls_json, tool_results_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.conversationId, data.role, data.content, toolCallsJson, toolResultsJson, now);

    db.prepare(`UPDATE ai_conversations SET updated_at = ? WHERE id = ?`).run(now, data.conversationId);

    return {
      id,
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      toolCallsJson,
      toolResultsJson,
      createdAt: now
    };
  },

  getMessages(conversationId: string): AiMessage[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC
    `).all(conversationId) as {
      id: string;
      role: "user" | "assistant" | "system" | "tool";
      content: string;
      tool_calls_json: string | null;
      tool_results_json: string | null;
      created_at: string;
    }[];

    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      toolCalls: r.tool_calls_json ? (JSON.parse(r.tool_calls_json) as AiMessage["toolCalls"]) : undefined,
      toolResults: r.tool_results_json ? (JSON.parse(r.tool_results_json) as AiMessage["toolResults"]) : undefined,
      createdAt: r.created_at
    }));
  },

  createActionDraft(data: {
    conversationId?: string;
    customerId: string;
    actionType: "refund" | "reschedule" | "transfer";
    parameters: unknown;
    reason: string;
    riskScore?: number;
  }): AiActionDraftRecord {
    const db = getDb();
    const id = `draft_${crypto.randomBytes(8).toString("hex")}`;
    const now = new Date().toISOString();
    const parametersJson = JSON.stringify(data.parameters);
    const riskScore = data.riskScore ?? 0.0;

    db.prepare(`
      INSERT INTO ai_action_drafts (id, conversation_id, customer_id, action_type, parameters_json, reason, risk_score, status, supervisor_id, created_at, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)
    `).run(id, data.conversationId ?? null, data.customerId, data.actionType, parametersJson, data.reason, riskScore, now);

    return {
      id,
      conversationId: data.conversationId ?? null,
      customerId: data.customerId,
      actionType: data.actionType,
      parametersJson,
      reason: data.reason,
      riskScore,
      status: "pending",
      supervisorId: null,
      createdAt: now,
      reviewedAt: null
    };
  },

  listActionDrafts(status?: "pending" | "approved" | "rejected"): AiActionDraftRecord[] {
    const db = getDb();
    let sql = `SELECT * FROM ai_action_drafts`;
    const params: string[] = [];

    if (status) {
      sql += ` WHERE status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC LIMIT 100`;

    const rows = db.prepare(sql).all(...params) as {
      id: string;
      conversation_id: string | null;
      customer_id: string;
      action_type: "refund" | "reschedule" | "transfer";
      parameters_json: string;
      reason: string;
      risk_score: number;
      status: "pending" | "approved" | "rejected";
      supervisor_id: string | null;
      created_at: string;
      reviewed_at: string | null;
    }[];

    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      customerId: r.customer_id,
      actionType: r.action_type,
      parametersJson: r.parameters_json,
      reason: r.reason,
      riskScore: r.risk_score,
      status: r.status,
      supervisorId: r.supervisor_id,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at
    }));
  },

  getActionDraft(id: string): AiActionDraftRecord | null {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM ai_action_drafts WHERE id = ?`).get(id) as {
      id: string;
      conversation_id: string | null;
      customer_id: string;
      action_type: "refund" | "reschedule" | "transfer";
      parameters_json: string;
      reason: string;
      risk_score: number;
      status: "pending" | "approved" | "rejected";
      supervisor_id: string | null;
      created_at: string;
      reviewed_at: string | null;
    } | undefined;

    if (!row) return null;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      customerId: row.customer_id,
      actionType: row.action_type,
      parametersJson: row.parameters_json,
      reason: row.reason,
      riskScore: row.risk_score,
      status: row.status,
      supervisorId: row.supervisor_id,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at
    };
  },

  updateActionDraft(id: string, status: "approved" | "rejected", supervisorId: string): boolean {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE ai_action_drafts
      SET status = ?, supervisor_id = ?, reviewed_at = ?
      WHERE id = ?
    `).run(status, supervisorId, now, id);

    return result.changes > 0;
  }
};
