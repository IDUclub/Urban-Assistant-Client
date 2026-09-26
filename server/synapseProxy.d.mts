import type { IncomingMessage, ServerResponse } from "node:http";

export type SynapseProxy = {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
};

export function createSynapseProxy(
  env?: Record<string, string | undefined>,
): SynapseProxy;
