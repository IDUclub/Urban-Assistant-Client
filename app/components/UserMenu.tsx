import { observer } from "mobx-react-lite";
import { IoLogOutOutline, IoPersonCircleOutline } from "react-icons/io5";
import { MdAdminPanelSettings } from "react-icons/md";
import AuthStore from "@lib/AuthStore";

const UserMenu = observer(() => {
  const {
    firstName,
    lastName,
    username,
    isAuthenticated,
    isAdmin,
    logoutUser,
  } = AuthStore;

  if (!isAuthenticated) return null;

  const displayName =
    `${firstName ?? ""} ${lastName ?? ""}`.trim() ||
    username ||
    "Пользователь";

  return (
    <div className="group relative">
      <button
        type="button"
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-ui-border bg-surface-raised/95 text-brand-primary shadow-lg backdrop-blur transition-colors hover:border-brand-primary hover:bg-brand-soft focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        aria-label="Профиль пользователя"
        aria-haspopup="menu"
      >
        <IoPersonCircleOutline size={24} />
      </button>
      <div
        className="invisible absolute right-0 top-full z-10 w-max min-w-60 translate-y-1 pt-2 opacity-0 transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        <div
          role="menu"
          aria-label="Меню пользователя"
          className="rounded-3xl border border-ui-border bg-surface-raised/95 p-3 shadow-[0_24px_40px_-20px_var(--shadow-menu)] backdrop-blur"
        >
          <div className="flex items-center gap-3 px-2 pb-3 pt-1">
            <span className="shrink-0 text-brand-primary">
              <IoPersonCircleOutline size={30} />
            </span>
            <p className="min-w-0 max-w-56 truncate text-sm font-medium text-content-primary">
              {displayName}
            </p>
          </div>
          <div className="border-t border-ui-border pt-2">
            {isAdmin && (
              <a
                href="http://10.32.11.17:8100/admin/ui"
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-content-primary transition-colors hover:bg-brand-soft hover:text-brand-primary focus:bg-brand-soft focus:text-brand-primary focus:outline-none"
              >
                <MdAdminPanelSettings size={20} />
                <span>Админ панель</span>
              </a>
            )}
            <button
              type="button"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger-soft hover:text-danger-hover focus:bg-danger-soft focus:text-danger-hover focus:outline-none"
              onClick={() => logoutUser()}
            >
              <IoLogOutOutline size={20} />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default UserMenu;
