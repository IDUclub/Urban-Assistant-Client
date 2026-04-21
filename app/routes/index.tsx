import type { Route } from "./+types/index";
import { redirect } from "react-router";
import { Welcome } from "../welcome/welcome";
import AuthStore from "@lib/AuthStore";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Помощник проектировщика" },
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
