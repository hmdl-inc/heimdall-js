/**
 * Type definitions for Heimdall SDK
 */

export enum SpanKind {
  MCP_TOOL = "mcp.tool",
  MCP_RESOURCE = "mcp.resource",
  MCP_PROMPT = "mcp.prompt",
  MCP_REQUEST = "mcp.request",
  INTERNAL = "internal",
  CLIENT = "client",
  SERVER = "server",
}

export enum SpanStatus {
  UNSET = "unset",
  OK = "ok",
  ERROR = "error",
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
  timestamp: Date;
}

export interface MCPResourceAccess {
  uri: string;
  method: string;
  contentType?: string;
  contentLength?: number;
  error?: string;
  durationMs?: number;
  timestamp: Date;
}

export interface MCPPromptCall {
  name: string;
  arguments: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
  error?: string;
  durationMs?: number;
  timestamp: Date;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sessionId?: string;
  userId?: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

/**
 * Standard attribute keys for Heimdall spans
 */
export const HeimdallAttributes = {
  // MCP specific attributes
  MCP_TOOL_NAME: "mcp.tool.name",
  MCP_TOOL_ARGUMENTS: "mcp.tool.arguments",
  MCP_TOOL_RESULT: "mcp.tool.result",

  MCP_RESOURCE_URI: "mcp.resource.uri",
  MCP_RESOURCE_METHOD: "mcp.resource.method",
  MCP_RESOURCE_CONTENT_TYPE: "mcp.resource.content_type",
  MCP_RESOURCE_CONTENT_LENGTH: "mcp.resource.content_length",

  MCP_PROMPT_NAME: "mcp.prompt.name",
  MCP_PROMPT_ARGUMENTS: "mcp.prompt.arguments",
  MCP_PROMPT_MESSAGES: "mcp.prompt.messages",

  // Heimdall specific attributes
  HEIMDALL_SESSION_ID: "heimdall.session_id",
  HEIMDALL_USER_ID: "heimdall.user_id",
  HEIMDALL_ENVIRONMENT: "heimdall.environment",
  HEIMDALL_SERVICE_NAME: "heimdall.service_name",
  HEIMDALL_ORG_ID: "heimdall.org_id",
  HEIMDALL_PROJECT_ID: "heimdall.project_id",

  // Status and error attributes
  STATUS: "heimdall.status",
  ERROR_MESSAGE: "heimdall.error.message",
  ERROR_TYPE: "heimdall.error.type",

  // Timing attributes
  DURATION_MS: "heimdall.duration_ms",
} as const;

export type HeimdallAttributeKey =
  (typeof HeimdallAttributes)[keyof typeof HeimdallAttributes];

