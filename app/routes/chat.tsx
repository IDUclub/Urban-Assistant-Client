import type { Route } from "./+types/chat";
import { redirect } from "react-router";
import AuthStore from "@lib/AuthStore";
import DataStore from "@lib/DataStore";
import mskLogo from "/png/msk_logo.png";
import msiLogo from "/png/msi_logo.png";
import iduLogo from "/png/idu_logo.png";
import ChatSection from "@components/ChatSection";
import { IoIosMail } from "react-icons/io";
import { IoLogOutOutline } from "react-icons/io5";
import { MdDeleteForever } from "react-icons/md";
import ChatStore from "@lib/ChatStore";
import { observer } from "mobx-react-lite";

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

const ChatPage = observer(() => {
    const { logoutUser, firstName, lastName, isAuthenticated } = AuthStore;
    const { chatStoryPreview, activeChatId } = ChatStore;
    
    return (
        <main className="w-screen h-screen flex items-center justify-center">
            <div className="w-screen h-screen grid grid-cols-[1fr_4fr]">
                <aside className="min-w-0 h-full bg-white p-4 shadow-[20px_0_60px_-25px_rgba(15,23,42,0.28)] z-20 flex flex-col items-center font-cabin text-gray-900">
                    <div className="flex flex-col items-center justify-center gap-8">
                        <div className="flex items-center justify-center gap-6">
                            <img src={mskLogo} alt="Logo" className="xl:w-15 w-8 h-auto" />
                            <img src={msiLogo} alt="Logo" className="xl:w-15 w-8 h-auto" />
                            <img src={iduLogo} alt="Logo" className="xl:w-15 w-8 h-auto" />
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
                            relative mt-16 w-[80%] cursor-pointer overflow-hidden rounded-[1.75rem]
                            bg-linear-to-r from-[#0788CE] via-[#17A3D0] to-[#A5C21B]
                            p-px shadow-[0_0_24px_-4px_rgba(7,136,206,0.55)]
                            transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(23,163,208,0.5)]
                        "
                        onClick={() => {
                            ChatStore.clearChat();
                            ChatStore.addChat();
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
                    <div className="mt-8 py-5 flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden border-t border-gray-900/30">
                        <div className="px-4 text-sm font-medium uppercase tracking-[0.14em] text-gray-500">
                            История чатов
                        </div>
                        <div className="mt-4 flex min-w-0 flex-1 flex-col space-y-2 overflow-y-auto px-2">
                            {chatStoryPreview.length ? (
                                chatStoryPreview.map((chat) => (
                                    <div
                                        key={chat.id}
                                        className={`
                                            group
                                            flex w-full min-w-0 items-center justify-between
                                            gap-2 rounded-3xl px-3 py-2 text-sm transition-colors
                                            ${activeChatId === chat.id
                                                ? "bg-[#EAF5FF] text-[#0B5E8E]"
                                                : "bg-gray-50 text-gray-700 hover:bg-gray-100"}
                                        `}
                                    >
                                        <button
                                            type="button"
                                            className="min-w-0 flex-1 cursor-pointer px-2 py-1 text-left"
                                            onClick={() => ChatStore.loadChat(chat.id)}
                                        >
                                            <span className="block truncate">{chat.name}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="cursor-pointer text-2xl text-red-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-800"
                                            onClick={() => ChatStore.deleteChat(chat.id)}
                                            aria-label="Удалить чат"
                                        >
                                            <MdDeleteForever />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="px-4 py-3 text-sm text-gray-400">
                                    История пока пуста
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="w-full mt-auto">
                        {isAuthenticated && (
                            <button
                                className="flex items-center gap-1.5 text-red-600 text-lg cursor-pointer mt-auto my-8 mx-auto"
                                onClick={() => logoutUser()}
                            >
                                <span><IoLogOutOutline /></span>
                                {`${firstName} ${lastName}`}
                            </button>
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
