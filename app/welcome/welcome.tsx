import imgCover from "/png/img_cover.jpg";
import mskLogo from "/png/msk_logo.png";
import msiLogo from "/png/msi_logo.png";
import iduLogo from "/png/idu_logo.png";
import aiInstitute from "/png/ai_institute.png";
import { observer } from "mobx-react-lite";
import AuthStore from "@lib/AuthStore";

export const  Welcome = observer(() => {
  return (
    <main className="w-screen h-screen">
      <img src={imgCover} alt="Cover Image" className="brand-cover absolute w-screen h-screen top-0 left-0 z-1 object-cover object-center" />
      <div className="absolute w-screen h-screen top-0 left-0 z-2 flex flex-col items-center justify-center">
        <div className="brand-welcome-panel w-[80vw] h-[80vh] py-32 md:py-16 sm:py-8 backdrop-blur-2xl shadow-[0_0_80px_0_rgba(0,0,0,0.4)] rounded-[48px] flex flex-col items-center justify-between gap-8">
            <div className="flex items-center justify-center gap-6">
              <img src={mskLogo} alt="Logo" className="brand-logo xl:w-15 w-10 h-auto" />
              <img src={msiLogo} alt="Logo" className="brand-logo xl:w-15 w-10 h-auto" />
              <img src={iduLogo} alt="Logo" className="brand-logo xl:w-15 w-10 h-auto" />
              <img src={aiInstitute} alt="Logo" className="brand-logo xl:w-70 w-48 h-auto" />
            </div>
          <h1 className="brand-text-gradient font-semibold text-[48px] sm:text-[48px] md:text-[62px] xl:text-[112px] text-center text-transparent bg-clip-text w-min leading-[1.2]">Помощник проектировщикa</h1>
          <div className="flex items-center gap-6">
            {/* <Link to="/chat">
              <button className="px-10 py-4 bg-linear-to-r from-[#0888CE] to-[#9CC027] text-white rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors cursor-pointer customer:from-brand-gradient-start customer:to-brand-gradient-end customer:hover:bg-brand-hover">Войти</button>
            </Link> */}
            <button
              className="
                px-10 py-4 bg-linear-to-r from-[#0888CE] to-[#9CC027] text-white rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors cursor-pointer
                customer:from-brand-gradient-start customer:to-brand-gradient-end customer:hover:bg-brand-hover
              "
              onClick={() => AuthStore.loginUser()}
            >
              Войти
            </button>
            <a href="mailto:aicenter@str.mos.ru">
              <button className="px-10 py-4 bg-white text-gray-700 rounded-lg text-lg font-semibold hover:bg-gray-400 transition-colors border border-[#0989CE] cursor-pointer customer:border-brand-primary customer:text-content-secondary customer:hover:bg-surface-hover customer-dark:bg-surface-raised">Написать нам</button>
            </a>
          </div>
        </div>
      </div>
    </main>
  );
});
