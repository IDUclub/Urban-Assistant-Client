import type { Route } from "./+types/chat";
import { redirect } from "react-router";
import AuthStore from "@lib/AuthStore";
import DataStore from "@lib/DataStore";
import mskLogo from "/png/msk_logo.png";
import msiLogo from "/png/msi_logo.png";
import iduLogo from "/png/idu_logo.png";
import ChatSection from "@components/ChatSection";
import { IoIosMail } from "react-icons/io";
import ChatStore from "@lib/ChatStore";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Помощник проектировщика" },
  ];
}

export async function clientLoader({
  serverLoader,
  params,
}: Route.ClientLoaderArgs) {
//   const serverData = await serverLoader();
//   if (!serverData || !Array.isArray(serverData) || serverData.length === 0) {
//     const data = await getUserProjects();
//     return { projects: data }
//   }

//   return { projects: serverData };
    await AuthStore.init();

    if (!AuthStore.isAuthenticated) {
        throw redirect("/");
    }

    await DataStore.getUserProjects();
    await DataStore.getNonProjectStages();
}

export default function ChatPage() {
    return (
        <main className="w-screen h-screen flex items-center justify-center">
            {/* <h1 className="text-4xl font-semibold text-[48px] sm:text-[62px] md:text-[84px] xl:text-[128px]  text-center text-transparent bg-clip-text bg-linear-to-r from-[#0788CE] via-[#17A3D0] to-[#A5C21B] w-min leading-[1.2]">Chat Page</h1> */}
            <div className="w-screen h-screen grid grid-cols-[1fr_4fr]">
                <aside className="h-full bg-white p-4 shadow-[20px_0_60px_-25px_rgba(15,23,42,0.28)] z-20 flex flex-col items-center font-cabin text-gray-900">
                    <div className="flex flex-col items-center justify-center gap-8">
                        <div className="flex items-center justify-center gap-6">
                            <img src={mskLogo} alt="Logo" className="xl:w-15 md:w-12 h-auto" />
                            <img src={msiLogo} alt="Logo" className="xl:w-15 md:w-12 h-auto" />
                            <img src={iduLogo} alt="Logo" className="xl:w-15 md:w-12 h-auto" />
                        </div>
                        <h1
                            className="
                                text-[10px] sm:text-[12px] md:text-[18px] xl:text-[24px] font-medium text-center text-transparent whitespace-nowrap
                                bg-clip-text bg-linear-to-r from-[#0788CE] via-[#17A3D0] to-[#A5C21B]
                            "
                        >
                                Помощник проектировщика
                        </h1>
                    </div>
                    <button
                        className="w-[80%] py-6 px-10 mt-16 bg-white rounded-full drop-shadow-xl border border-gray-600/20 cursor-pointer"
                        onClick={() => ChatStore.clearChat()}
                    >
                        Новый чат
                    </button>
                    <div className="w-full border-t border-gray-900/30 mt-auto pb-3 flex justify-center">
                        <a href="mailto:aicenter@str.mos.ru">
                            <button className="py-5 flex items-center gap-2 cursor-pointer">
                                <span><IoIosMail size="1.5rem"/></span>
                                <p>Написать нам</p>
                            </button>
                        </a>
                    </div>
                </aside>
                <ChatSection />
            </div>
        </main>
    )
}
