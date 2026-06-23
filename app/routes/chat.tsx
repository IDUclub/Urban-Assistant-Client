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
import { IoLogOutOutline, IoPersonCircleOutline } from "react-icons/io5";
import ChatStore from "@lib/ChatStore";
import { observer } from "mobx-react-lite";
import { MdDeleteForever } from "react-icons/md";
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
    await DataStore.getNonProjectStages();
    await ChatStore.getUserChats();
}

const ChatPage = observer(() => {
    const { logoutUser, firstName, lastName, isAuthenticated } = AuthStore;
    const { chatStoryPreview, activeChatId, isUserChatsLoading, isUserChatOpening } = ChatStore;
    
    return (
        <main className="flex h-dvh w-screen items-center justify-center overflow-hidden">
            <div className="grid h-dvh w-screen grid-cols-[1fr_2fr] lg:grid-cols-[1fr_3fr] 2xl:grid-cols-[1fr_4fr] overflow-hidden">
                <aside className="z-20 flex h-dvh min-w-0 flex-col items-center overflow-hidden bg-white p-4 font-cabin text-gray-900 shadow-[20px_0_60px_-25px_rgba(15,23,42,0.28)]">
                    <div className="flex flex-col items-center justify-center gap-4 lg:gap-6 xl:gap-6 2xl:gap-8">
                        <div className="flex flex-col items-center justify-center gap-2">
                            <div className="flex items-center justify-center gap-6">
                                <img src={mskLogo} alt="Logo" className="2xl:w-14 xl:w-9 lg:w-7 w-4 h-auto" />
                                <img src={msiLogo} alt="Logo" className="2xl:w-15 xl:w-10 lg:w-8 w-4 h-auto" />
                                <img src={iduLogo} alt="Logo" className="2xl:w-15 xl:w-10 lg:w-8 w-4 h-auto" />
                                {/* <img src={aiInstitute} alt="Logo" className="xl:w-50 w-24 h-auto" /> */}
                            </div>
                            <img src={aiInstitute} alt="Logo" className="2xl:w-70 xl:w-50 w-24 h-auto" />
                        </div>
                        <h1
                            className="
                                max-w-full text-[10px] sm:text-[12px] md:text-[18px] lg:text-[20px] xl:text-[24px] font-medium text-center text-transparent leading-tight
                                wrap-break-word
                                bg-clip-text bg-linear-to-r from-[#0788CE] via-[#17A3D0] to-[#A5C21B]
                            "
                        >
                                Помощник проектировщика
                        </h1>
                    </div>
                    <button
                        className="
                            relative mt-10 w-[80%] cursor-pointer overflow-hidden rounded-[1.75rem]
                            bg-linear-to-r from-[#0788CE] via-[#17A3D0] to-[#A5C21B]
                            p-px shadow-[0_0_24px_-4px_rgba(7,136,206,0.55)]
                            transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(23,163,208,0.5)]
                        "
                        onClick={() => {
                            ChatStore.clearChat();
                        }}
                    >
                        <span
                            className="
                                flex w-full items-center justify-center rounded-[calc(1.75rem-1px)]
                                bg-white/96 px-6 py-4 text-base font-medium tracking-[0.01em] text-gray-900 backdrop-blur
                            "
                        >
                            Новый чат
                        </span>
                    </button>
                    <ChatStory />
                    <div className="w-full mt-auto">
                        {isAuthenticated && (
                            <div className="my-5 flex w-full items-center gap-3 rounded-[1.75rem] border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.55)]">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <span className="shrink-0 text-[#0788CE]">
                                        <IoPersonCircleOutline size="2.25rem" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900">
                                            {`${firstName ?? ""} ${lastName ?? ""}`.trim() || "Пользователь"}
                                        </p>
                                    </div>
                                </div>
                                <div className="group relative shrink-0">
                                    <button
                                        type="button"
                                        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
                                        onClick={() => logoutUser()}
                                        aria-label="Выйти"
                                        aria-describedby="logout-tooltip"
                                    >
                                        <IoLogOutOutline size="1.2rem" />
                                    </button>
                                    <div
                                        id="logout-tooltip"
                                        role="tooltip"
                                        className="pointer-events-none absolute right-full top-1/2 z-20 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                    >
                                        Выйти
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="w-full border-t border-gray-900/30 pb-3 flex justify-center">
                            <a href="mailto:aicenter@str.mos.ru">
                                <button className="py-5 flex items-center gap-2 cursor-pointer">
                                    <span><IoIosMail size="1.5rem"/></span>
                                    <p>Написать нам</p>
                                </button>
                            </a>
                        </div>
                    </div>
                </aside>
                <ChatSection />
            </div>
        </main>
    )
});

export default ChatPage;
