/**
 * Configuration for Heimdall SDK
 */

export interface HeimdallConfig {
  /**
   * API key for authenticating with Heimdall platform
   */
  apiKey?: string;

  /**
   * The Heimdall platform endpoint URL
   * @default "http://localhost:4318"
   */
  endpoint?: string;

  /**
   * Name of the service being instrumented
   * @default "mcp-server"
   */
  serviceName?: string;

  /**
   * Deployment environment (e.g., 'production', 'staging')
   * @default "development"
   */
  environment?: string;

  /**
   * Organization ID from Heimdall dashboard
   * @default "default"
   */
  orgId?: string;

  /**
   * Project ID to associate traces with in Heimdall
   * @default "default"
   */
  projectId?: string;

  /**
   * Session ID to associate with all spans.
   * Useful for tracking requests from the same MCP client session.
   * Can be set at initialization or updated dynamically via client.setSessionId()
   */
  sessionId?: string;

  /**
   * User ID to associate with all spans.
   * Can be overridden per-span using userExtractor option in wrappers.
   */
  userId?: string;

  /**
   * Whether tracing is enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Number of spans to batch before sending
   * @default 100
   */
  batchSize?: number;

  /**
   * Interval in milliseconds to flush spans
   * @default 5000
   */
  flushIntervalMs?: number;

  /**
   * Maximum number of spans to queue
   * @default 1000
   */
  maxQueueSize?: number;

  /**
   * Additional metadata to attach to all spans
   */
  metadata?: Record<string, unknown>;
}

/**
 * Resolved configuration with all defaults applied
 */
export interface ResolvedHeimdallConfig {
  apiKey: string | undefined;
  endpoint: string;
  serviceName: string;
  environment: string;
  orgId: string;
  projectId: string;
  sessionId: string | undefined;
  userId: string | undefined;
  enabled: boolean;
  debug: boolean;
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
  metadata: Record<string, unknown>;
}

/**
 * Get environment variable value
 */
function getEnv(key: string, defaultValue?: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] ?? defaultValue;
  }
  return defaultValue;
}

/**
 * Get boolean environment variable
 */
function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = getEnv(key);
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true";
}

/**
 * Get numeric environment variable
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = getEnv(key);
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Resolve configuration with defaults from environment variables
 */
export function resolveConfig(config: HeimdallConfig = {}): ResolvedHeimdallConfig {
  return {
    apiKey: config.apiKey ?? getEnv("HEIMDALL_API_KEY"),
    endpoint: config.endpoint ?? getEnv("HEIMDALL_ENDPOINT", "http://localhost:4318")!,
    serviceName: config.serviceName ?? getEnv("HEIMDALL_SERVICE_NAME", "mcp-server")!,
    environment: config.environment ?? getEnv("HEIMDALL_ENVIRONMENT", "development")!,
    orgId: config.orgId ?? getEnv("HEIMDALL_ORG_ID", "default")!,
    projectId: config.projectId ?? getEnv("HEIMDALL_PROJECT_ID", "default")!,
    sessionId: config.sessionId ?? getEnv("HEIMDALL_SESSION_ID"),
    userId: config.userId ?? getEnv("HEIMDALL_USER_ID"),
    enabled: config.enabled ?? getEnvBool("HEIMDALL_ENABLED", true),
    debug: config.debug ?? getEnvBool("HEIMDALL_DEBUG", false),
    batchSize: config.batchSize ?? getEnvNumber("HEIMDALL_BATCH_SIZE", 100),
    flushIntervalMs: config.flushIntervalMs ?? getEnvNumber("HEIMDALL_FLUSH_INTERVAL_MS", 5000),
    maxQueueSize: config.maxQueueSize ?? getEnvNumber("HEIMDALL_MAX_QUEUE_SIZE", 1000),
    metadata: config.metadata ?? {},
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: ResolvedHeimdallConfig): void {
  // API key is optional for local development
  if (config.batchSize < 1) {
    throw new Error("batchSize must be at least 1");
  }
  if (config.flushIntervalMs < 100) {
    throw new Error("flushIntervalMs must be at least 100");
  }
  if (config.maxQueueSize < config.batchSize) {
    throw new Error("maxQueueSize must be at least batchSize");
  }
}

