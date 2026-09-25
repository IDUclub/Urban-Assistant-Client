import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createSynapseProxy } from "./server/synapseProxy.mjs";

function synapseProxyPlugin(env: Record<string, string>): Plugin {
  const proxy = createSynapseProxy(env);
  return {
    name: "synapse-server-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        (
          request: IncomingMessage,
          response: ServerResponse,
          next: (error?: unknown) => void,
        ) => {
          void proxy
            .handle(request, response)
            .then((handled) => {
              if (!handled) next();
            })
            .catch(next);
        },
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [synapseProxyPlugin(env), tailwindcss(), reactRouter()],
    resolve: {
      tsconfigPaths: true,
    },
  };
});
