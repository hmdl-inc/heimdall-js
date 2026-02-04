# hmdl - Heimdall Observability SDK for JavaScript/TypeScript

[![npm version](https://badge.fury.io/js/hmdl.svg)](https://badge.fury.io/js/hmdl)
[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Observability SDK for MCP (Model Context Protocol) servers, built on OpenTelemetry.

## Installation

```bash
npm install hmdl
# or
yarn add hmdl
# or
pnpm add hmdl
```

## Quick Start

### 1. Create Organization and Project in Heimdall

Before using the SDK, you need to set up your organization and project in the Heimdall dashboard:

1. Start the Heimdall backend and frontend (see [Heimdall README](../heimdall/README.md))
2. Navigate to http://localhost:5173
3. **Create an account** with your email and password
4. **Create an Organization** - this groups your projects together
5. **Create a Project** - each project has a unique ID for trace collection
6. Go to **Settings** to find your **Organization ID** and **Project ID**

### 2. Set up environment variables

```bash
# Required for local development
export HEIMDALL_ENDPOINT="http://localhost:4318"  # Your Heimdall backend
export HEIMDALL_ORG_ID="your-org-id"              # From Heimdall Settings page
export HEIMDALL_PROJECT_ID="your-project-id"      # From Heimdall Settings page
export HEIMDALL_ENABLED="true"

# Optional
export HEIMDALL_SERVICE_NAME="my-mcp-server"
export HEIMDALL_ENVIRONMENT="development"

# For production (with API key)
export HEIMDALL_API_KEY="your-api-key"
export HEIMDALL_ENDPOINT="https://api.heimdall.dev"
```

### 3. Initialize the client

```typescript
import { HeimdallClient } from 'hmdl';

// Initialize (uses environment variables by default)
const client = new HeimdallClient();

// Or with explicit configuration
const client = new HeimdallClient({
  endpoint: 'http://localhost:4318',
  orgId: 'your-org-id',           // From Settings page
  projectId: 'your-project-id',   // From Settings page
  serviceName: 'my-mcp-server',
  environment: 'development',
});
```

### 4. Instrument your MCP tool functions

#### Using wrapper functions

```typescript
import { traceMCPTool } from 'hmdl';

const searchDocuments = traceMCPTool(
  async (query: string, limit: number = 10) => {
    // Your implementation here
    return results;
  },
  { name: 'search-documents', paramNames: ['query', 'limit'] }
);

const anotherTool = traceMCPTool(
  async (data: Record<string, unknown>) => {
    return { processed: true, ...data };
  },
  { name: 'another-tool', paramNames: ['data'] }
);
```

#### Using TypeScript decorators

```typescript
import { HeimdallClient, MCPTool } from 'hmdl';

// Initialize client first
new HeimdallClient();

class MyMCPServer {
  @MCPTool()
  async searchDocuments(query: string, limit: number = 10) {
    // Your implementation
    return results;
  }

  @MCPTool({ name: 'custom-tool-name' })
  async anotherTool(data: unknown) {
    return processedData;
  }
}
```

### 5. Flush on shutdown

```typescript
// Ensure spans are flushed before exit
process.on('beforeExit', async () => {
  await client.flush();
});

// Or for graceful shutdown
process.on('SIGTERM', async () => {
  await client.shutdown();
  process.exit(0);
});
```

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `HEIMDALL_ENDPOINT` | Heimdall backend URL | `http://localhost:4318` |
| `HEIMDALL_ORG_ID` | Organization ID (from Settings page) | `default` |
| `HEIMDALL_PROJECT_ID` | Project ID (from Settings page) | `default` |
| `HEIMDALL_ENABLED` | Enable/disable tracing | `true` |
| `HEIMDALL_SERVICE_NAME` | Service name for traces | `mcp-server` |
| `HEIMDALL_ENVIRONMENT` | Deployment environment | `development` |
| `HEIMDALL_API_KEY` | API key (optional for local dev) | - |
| `HEIMDALL_DEBUG` | Enable debug logging | `false` |
| `HEIMDALL_BATCH_SIZE` | Spans per batch | `100` |
| `HEIMDALL_FLUSH_INTERVAL_MS` | Flush interval (ms) | `5000` |
| `HEIMDALL_SESSION_ID` | Default session ID | - |
| `HEIMDALL_USER_ID` | Default user ID | - |

### Local Development

For local development, you don't need an API key. Just set:

```bash
export HEIMDALL_ENDPOINT="http://localhost:4318"
export HEIMDALL_ORG_ID="your-org-id"          # Copy from Settings page
export HEIMDALL_PROJECT_ID="your-project-id"  # Copy from Settings page
export HEIMDALL_ENABLED="true"
```

## Advanced Usage

### Session and User Tracking

`traceMCPTool` automatically includes session and user IDs in spans. You just need to provide them via one of these methods:

#### Option 1: HTTP Headers (Recommended for MCP servers)

Pass HTTP headers directly to `traceMCPTool`. Session ID is extracted from the `Mcp-Session-Id` header, and user ID from the JWT token in the `Authorization` header:

```typescript
import { traceMCPTool } from 'hmdl';

app.post('/mcp', async (req, res) => {
  const searchTool = traceMCPTool(async (query: string) => {
    return results;
  }, {
    name: 'search',
    headers: req.headers  // Automatically extracts session/user
  });

  const result = await searchTool('test');
  res.json(result);
});
```

#### Option 2: Extractors (Per-tool extraction)

```typescript
const myTool = traceMCPTool(
  (ctx: { sessionId?: string; userId?: string }, query: string) => {
    return `Query: ${query}`;
  },
  {
    name: 'my-tool',
    // Context is the first argument (args[0])
    sessionExtractor: (args) => args[0]?.sessionId,
    userExtractor: (args) => args[0]?.userId,
  }
);
```

#### Resolution Priority

1. Extractor callback → 2. HTTP headers → 3. Client value (initialized from environment variables)

> **Note**: If no user ID is found through any of these methods, `"anonymous"` is used as the default.

### Manual spans

```typescript
import { HeimdallClient } from 'hmdl';

const client = new HeimdallClient();

await client.startSpan('my-operation', async (span) => {
  span.setAttribute('custom.attribute', 'value');
  // Your code here
  return result;
});
```

### Wrapper options

```typescript
const myTool = traceMCPTool(fn, {
  name: 'custom-name',      // Custom span name
  paramNames: ['query', 'limit'],  // Parameter names for better input display
  captureInput: true,       // Capture function arguments (default: true)
  captureOutput: false,     // Don't capture return value
});
```

> **Note**: The `paramNames` option allows you to specify parameter names for better input display in the Heimdall dashboard. Without it, inputs are shown as an array. With it, inputs are shown as a named object (e.g., `{"query": "test", "limit": 10}` instead of `["test", 10]`).

## What gets tracked?

For each MCP function call, Heimdall tracks:

- **Input parameters**: Function arguments (serialized to JSON)
- **Output/response**: Return value (serialized to JSON)
- **Status**: Success or error
- **Latency**: Execution time in milliseconds
- **Errors**: Exception type, message, and stack trace
- **Metadata**: Service name, environment, timestamps

## OpenTelemetry Integration

This SDK is built on OpenTelemetry, making it compatible with the broader observability ecosystem.

## License

MIT License - see [LICENSE](LICENSE) for details.

