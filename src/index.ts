/**
 * Heimdall Observability SDK for MCP Servers
 *
 * A TypeScript/JavaScript SDK for instrumenting MCP (Model Context Protocol) servers
 * with OpenTelemetry-based observability tracking.
 *
 * @packageDocumentation
 */

// Client
export { HeimdallClient } from "./client";

// Configuration
export type { HeimdallConfig, ResolvedHeimdallConfig } from "./config";
export { resolveConfig, validateConfig } from "./config";

// Wrappers and decorators
export { traceMCPTool, MCPTool } from "./wrappers";
export type { UserExtractor, SessionExtractor, WrapperOptions } from "./wrappers";

// Types
export { SpanKind, SpanStatus, HeimdallAttributes } from "./types";
export type { MCPToolCall, TraceContext, HeimdallAttributeKey } from "./types";

// Version
export const VERSION = "0.1.0";

