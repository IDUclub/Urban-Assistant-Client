import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import type { Route } from "./+types/root";
import AuthStore from "@lib/AuthStore";
import PageLoader from "@components/PageLoader";
import ThemeToggle from "@components/ThemeToggle";
import { BRAND_THEME } from "@/config";
import "./app.css";

export const links: Route.LinksFunction = () => [
  {
    rel: "preload",
    href: "/fonts/inter/Inter-Regular.ttf",
    as: "font",
    type: "font/ttf",
    crossOrigin: "anonymous",
  },
  {
    rel: "preload",
    href: "/fonts/inter/Inter-SemiBold.ttf",
    as: "font",
    type: "font/ttf",
    crossOrigin: "anonymous",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-brand={BRAND_THEME} data-color-scheme="light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {BRAND_THEME === "customer" ? <ThemeToggle /> : null}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return <PageLoader />;
}

const App = observer(function App() {
  useEffect(() => {
    void AuthStore.init();
  }, []);

  if (AuthStore.status === "idle" || AuthStore.status === "initializing") {
    return <PageLoader />;
  }

  return <Outlet />;
});

export default App;

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
