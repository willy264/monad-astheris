import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { canonical, check, ClientError, endpoint, object, request } from './common.js';

export function validateToolResult(result: unknown): Record<string, unknown> {
  const parsed = CallToolResultSchema.safeParse(result);
  check(parsed.success, 'MCP returned an invalid tool result');
  check(parsed.data.isError !== true, 'MCP tool reported an error; no task/payment was submitted');
  check(parsed.data.content.length > 0 || parsed.data.structuredContent !== undefined, 'MCP tool returned no output');
  check(Buffer.byteLength(canonical(parsed.data)) <= 4 * 1024 * 1024, 'MCP tool output exceeds 4 MiB');
  return object(parsed.data);
}
export async function callMcp(url: string, tool: string, args: Record<string, unknown>, token?: string): Promise<Record<string, unknown>> {
  const client = new Client({ name: 'aetheris-task-client', version: '0.1.0' }, { capabilities: {} });
  // No SSE fallback, authentication prompts, or tools/call retries: a tool may
  // have side effects. The caller journals invocation intent before entering here.
  const transport = new StreamableHTTPClientTransport(new URL(endpoint(url)), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    fetch: async (input, init) => {
      const response = await request(typeof input === 'string' ? input : input.href, init, 90_000);
      if (!response.body) return response;
      let bytes = 0;
      const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
        bytes += chunk.length;
        check(bytes <= 8 * 1024 * 1024, 'MCP transport response exceeds 8 MiB');
        controller.enqueue(chunk);
      } }));
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    },
    reconnectionOptions: { maxRetries: 0, maxReconnectionDelay: 1000, initialReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
  });
  try {
    await client.connect(transport);
    let cursor: string | undefined;
    let found = false;
    for (let page = 0; page < 20; page++) {
      const tools = await client.listTools(cursor ? { cursor } : undefined);
      if (tools.tools.some(item => item.name === tool)) { found = true; break; }
      cursor = tools.nextCursor;
      if (!cursor) break;
    }
    check(found, 'Configured MCP tool is not advertised by the server');
    return validateToolResult(await client.callTool({ name: tool, arguments: args }, CallToolResultSchema, { timeout: 90_000 }));
  } catch (error) {
    if (error instanceof ClientError) throw error;
    throw new ClientError('MCP initialization/tool request failed; invocation may have run. Preserve the journal and reconcile before another call');
  } finally { await client.close().catch(() => {}); }
}
