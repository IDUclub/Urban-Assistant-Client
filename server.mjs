import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import http from "node:http";

const clientDir = join(process.cwd(), "build", "client");
const port = Number(process.env.PORT ?? 3000);

const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
};

function resolveFilePath(urlPath) {
    const safePath = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
    const requestedPath = join(clientDir, safePath);

    if (existsSync(requestedPath) && statSync(requestedPath).isFile()) {
        return requestedPath;
    }

    return join(clientDir, "index.html");
}

const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const filePath = resolveFilePath(requestUrl.pathname);
    const extension = extname(filePath).toLowerCase();
    const isHtmlFallback = extension === ".html" && !existsSync(join(clientDir, requestUrl.pathname));

    response.setHeader("Content-Type", contentTypes[extension] ?? "application/octet-stream");
    response.setHeader("Cache-Control", isHtmlFallback ? "no-cache" : "public, max-age=31536000, immutable");

    createReadStream(filePath)
        .on("error", () => {
            response.statusCode = 500;
            response.end("Unable to read file");
        })
        .pipe(response);
});

server.listen(port, "0.0.0.0", () => {
    console.log(`Static server listening on http://0.0.0.0:${port}`);
});
