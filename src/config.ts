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
   * @default "https://api.heimdall.dev"
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
   * Project ID to associate traces with in Heimdall
   * @default "default"
   */
  projectId?: string;

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
  projectId: string;
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
    endpoint: config.endpoint ?? getEnv("HEIMDALL_ENDPOINT", "https://api.heimdall.dev")!,
    serviceName: config.serviceName ?? getEnv("HEIMDALL_SERVICE_NAME", "mcp-server")!,
    environment: config.environment ?? getEnv("HEIMDALL_ENVIRONMENT", "development")!,
    projectId: config.projectId ?? getEnv("HEIMDALL_PROJECT_ID", "default")!,
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

