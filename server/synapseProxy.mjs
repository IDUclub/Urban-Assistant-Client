import { Readable } from "node:stream";

const ROUTE_PREFIX = "/api/synapse";
const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;
const ALLOWED_ROUTES = [
  /^GET \/configurations\/run-configurations\/$/,
  /^GET \/configurations\/workflows\/$/,
  /^POST \/projects$/,
  /^GET \/projects\/[^/]+$/,
  /^(GET|POST) \/projects\/[^/]+\/messages$/,
  /^GET \/projects\/[^/]+\/archive$/,
  /^GET \/projects\/[^/]+\/archive\/[^/]+\/(content|download-url)$/,
];

function trimTrailingSlashes(value = "") {
  return value.trim().replace(/\/+$/, "");
}

function normalizeSynapseApiUrl(value = "") {
  const url = trimTrailingSlashes(value);
  if (!url) {
    return "";
  }

  return url.endsWith("/api") ? url : `${url}/api`;
}

function sendJson(response, status, body) {
  if (response.headersSent || response.destroyed) {
    return;
  }

  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function bearerToken(request) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return;
  }

  return authorization.slice(7).trim() || undefined;
}

function isAllowedRoute(method, path) {
  const route = `${method} ${path}`;

  return ALLOWED_ROUTES.some((pattern) => pattern.test(route));
}

async function readRequestBody(request) {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (contentLength > MAX_REQUEST_BODY_BYTES) {
    const error = new Error("Request body is too large");
    error.status = 413;
    throw error;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BODY_BYTES) {
      const error = new Error("Request body is too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export function createSynapseProxy(env = process.env) {
  const synapseApiUrl = normalizeSynapseApiUrl(env.SYNAPSE_API_URL ?? "");
  const synapseEmail = String(env.SYNAPSE_EMAIL ?? "").trim();
  const synapsePassword = String(env.SYNAPSE_PASSWORD ?? "");
  const keycloakUrl = trimTrailingSlashes(
    env.KEYCLOAK_AUTH_URL ?? env.VITE_KEYCLOAK_AUTH_URL ?? "",
  );
  const keycloakRealm = String(
    env.KEYCLOAK_AUTH_REALM ?? env.VITE_KEYCLOAK_AUTH_REALM ?? "",
  ).trim();
  const userInfoUrl =
    keycloakUrl && keycloakRealm
      ? `${keycloakUrl}/realms/${encodeURIComponent(keycloakRealm)}/protocol/openid-connect/userinfo`
      : "";

  let accessToken;
  let refreshToken;
  let loginPromise;
  let refreshPromise;

  function assertConfigured() {
    if (!synapseApiUrl || !synapseEmail || !synapsePassword) {
      const error = new Error("Synapse server proxy is not configured");
      error.status = 503;
      throw error;
    }
    if (!userInfoUrl) {
      const error = new Error("Keycloak validation is not configured");
      error.status = 503;
      throw error;
    }
  }

  async function validateUser(request) {
    const token = bearerToken(request);
    if (!token) {
      return false;
    }

    const response = await fetch(userInfoUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (!response.ok) {
      const error = new Error(
        `Synapse request failed (${response.status})`,
      );
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function performLogin() {
    const response = await fetch(`${synapseApiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: synapseEmail, password: synapsePassword }),
    });
    const tokens = await readJsonResponse(response);
    accessToken = tokens?.access_token;
    refreshToken = tokens?.refresh_token;
    if (!accessToken || !refreshToken) {
      throw new Error("Synapse authentication response has no tokens");
    }
  }

  async function login() {
    if (!loginPromise) {
      loginPromise = performLogin().finally(() => {
        loginPromise = undefined;
      });
    }
    await loginPromise;
  }

  async function performRefresh() {
    if (!refreshToken) {
      await login();
      return;
    }

    const response = await fetch(`${synapseApiUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (response.status === 401 || response.status === 403) {
      accessToken = undefined;
      refreshToken = undefined;
      await login();
      return;
    }

    const tokens = await readJsonResponse(response);
    accessToken = tokens?.access_token;
    refreshToken = tokens?.refresh_token;
    if (!accessToken || !refreshToken) {
      throw new Error("Synapse refresh response has no tokens");
    }
  }

  async function refresh() {
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = undefined;
      });
    }
    await refreshPromise;
  }

  async function synapseFetch(path, init, retry = true) {
    if (!accessToken) {
      await login();
    }

    const requestToken = accessToken;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${requestToken}`);

    const response = await fetch(`${synapseApiUrl}${path}`, {
      ...init,
      headers,
    });
    if (response.status === 401 && retry) {
      if (requestToken === accessToken) await refresh();
      return synapseFetch(path, init, false);
    }
    return response;
  }

  async function archiveContentFetch(path, signal) {
    const downloadUrlPath = path.replace(/\/content$/, "/download-url");
    const descriptorResponse = await synapseFetch(downloadUrlPath, {
      method: "GET",
      signal,
    });
    const descriptor = await readJsonResponse(descriptorResponse);
    const url = new URL(String(descriptor?.url ?? ""));
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      const error = new Error("Invalid archive download URL");
      error.status = 502;
      throw error;
    }
    return fetch(url, { signal });
  }

  async function handle(request, response) {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`,
    );
    if (
      requestUrl.pathname !== ROUTE_PREFIX &&
      !requestUrl.pathname.startsWith(`${ROUTE_PREFIX}/`)
    ) {
      return false;
    }

    try {
      assertConfigured();
      if (!(await validateUser(request))) {
        sendJson(response, 401, { detail: "Unauthorized" });
        return true;
      }

      const path = requestUrl.pathname.slice(ROUTE_PREFIX.length) || "/";
      const method = request.method ?? "GET";
      if (!isAllowedRoute(method, path)) {
        sendJson(response, 404, { detail: "Synapse route is not available" });
        return true;
      }

      const body =
        method === "GET" || method === "HEAD"
          ? undefined
          : await readRequestBody(request);
      const headers = {};
      if (request.headers["content-type"]) {
        headers["Content-Type"] = request.headers["content-type"];
      }
      if (request.headers.accept) {
        headers.Accept = request.headers.accept;
      }

      const controller = new AbortController();
      request.once("aborted", () => controller.abort());
      response.once("close", () => {
        if (!response.writableEnded) {
          controller.abort();
        }
      });

      const isArchiveContent =
        method === "GET" &&
        /^\/projects\/[^/]+\/archive\/[^/]+\/content$/.test(path);
      const upstream = isArchiveContent
        ? await archiveContentFetch(path, controller.signal)
        : await synapseFetch(`${path}${requestUrl.search}`, {
            method,
            headers,
            body,
            signal: controller.signal,
          });

      response.statusCode = upstream.status;
      for (const name of [
        "content-type",
        "content-disposition",
        "cache-control",
      ]) {
        const value = upstream.headers.get(name);
        if (value) response.setHeader(name, value);
      }
      if (!upstream.body) {
        response.end();
        return true;
      }

      Readable.fromWeb(upstream.body)
        .on("error", (error) => {
          if (!response.destroyed) response.destroy(error);
        })
        .pipe(response);
      return true;
    } catch (error) {
      if (error?.name === "AbortError" || response.destroyed) {
        return true;
      }

      console.error("[SYNAPSE_PROXY] request failed", error?.message ?? error);
      sendJson(response, error?.status ?? 502, {
        detail:
          error?.status === 413
            ? "Request body is too large"
            : "Synapse proxy request failed",
      });
      return true;
    }
  }

  return { handle };
}
