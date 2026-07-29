import type { Route } from "./+types/chat";
import { redirect } from "react-router";
import AuthStore from "@lib/AuthStore";
import DataStore from "@lib/DataStore";
import mskLogo from "/png/msk_logo.png";
import msiLogo from "/png/msi_logo.png";
import iduLogo from "/png/idu_logo.png";
import aiInstitute from "/png/ai_institute.png";
import ChatSection from "@components/ChatSection";
import { IoIosMail } from "react-icons/io";
import ChatStore from "@lib/ChatStore";
import ChatStory from "@components/ChatStory";

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
    await ChatStore.getUserChats();
}

const ChatPage = () => {
    return (
        <main className="flex h-dvh w-screen items-center justify-center overflow-hidden">
            <div className="grid h-dvh w-screen grid-cols-[1fr_2fr] lg:grid-cols-[1fr_3fr] 2xl:grid-cols-[1fr_4fr] overflow-hidden">
                <aside className="z-20 flex h-dvh min-w-0 flex-col items-center overflow-hidden bg-white p-4 font-cabin text-gray-900 shadow-[20px_0_60px_-25px_var(--shadow-sidebar)] customer:bg-surface-panel customer:text-content-primary">
                    <div className="flex w-full min-w-0 items-center gap-3 px-2 py-2">
                        <span
                            aria-hidden="true"
                            className="
                                h-10 w-1 shrink-0 rounded-full
                                bg-linear-to-b from-brand-gradient-start via-brand-gradient-middle to-brand-gradient-end
                                shadow-[0_0_12px_-2px_var(--brand-shadow-strong)]
                            "
                        />
                        <h1
                            className="
                                min-w-0 text-left text-[15px] font-semibold leading-tight text-content-primary
                                sm:text-[16px] lg:text-[17px] xl:text-[18px]
                            "
                        >
                            <span className="block">Помощник</span>
                            <span className="block text-brand-primary">проектировщика</span>
                        </h1>
                    </div>
                    <ChatStory />
                    <div className="mt-auto w-full border-t border-(--sidebar-divider-color) pt-4">
                        <div className="flex w-full flex-nowrap items-center justify-center gap-3 xl:gap-4">
                            <img src={mskLogo} alt="Logo" className="brand-logo h-auto w-4 lg:w-6 xl:w-7 2xl:w-9" />
                            <img src={msiLogo} alt="Logo" className="brand-logo h-auto w-4 lg:w-6 xl:w-7 2xl:w-9" />
                            <img src={iduLogo} alt="Logo" className="brand-logo h-auto w-4 lg:w-6 xl:w-7 2xl:w-9" />
                            <img src={aiInstitute} alt="Logo" className="brand-logo h-auto w-20 lg:w-24 xl:w-28 2xl:w-32" />
                        </div>
                        <div className="flex w-full justify-center pb-3">
                            <a href="mailto:aicenter@str.mos.ru">
                                <button className="grid cursor-pointer grid-cols-[1.5rem_auto_1.5rem] items-center gap-2 py-4">
                                    <span><IoIosMail size="1.5rem"/></span>
                                    <p>Написать нам</p>
                                    <span aria-hidden="true" className="h-6 w-6" />
                                </button>
                            </a>
                        </div>
                    </div>
                </aside>
                <ChatSection />
            </div>
        </main>
    )
};

export default ChatPage;
