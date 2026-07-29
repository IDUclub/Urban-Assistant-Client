import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/index.tsx"),
    route("/loader-preview", "routes/loader-preview.tsx"),
    route("/chat", "routes/chat.tsx"),
] satisfies RouteConfig;
