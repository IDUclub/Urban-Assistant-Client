import type { Route } from "./+types/index";
import { redirect } from "react-router";
import { Welcome } from "../welcome/welcome";
import AuthStore from "@lib/AuthStore";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export async function clientLoader() {
  await AuthStore.init();

  if (AuthStore.isAuthenticated) {
    throw redirect("/chat");
  }
}

export default function Home() {
  return <Welcome />;
}
