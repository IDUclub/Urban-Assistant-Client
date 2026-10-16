import { useEffect, useState, type ReactNode } from "react";
import { MdKeyboardArrowDown, MdOutlineEdit } from "react-icons/md";

export default function CollapsibleChatInput({ children, canCollapse }: {
  children: ReactNode;
  canCollapse: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isHidden = canCollapse && isCollapsed;

  useEffect(() => {
    if (!canCollapse) {
      setIsCollapsed(false);
    }
  }, [canCollapse]);

  return (
    <div className="relative shrink-0">
      {canCollapse && (
        <button
          type="button"
          onClick={() => setIsCollapsed((current) => !current)}
          aria-expanded={!isHidden}
          aria-label={isHidden ? "Спросите помощника" : "Свернуть поле запроса"}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-ui-border bg-surface-raised/95 text-brand-primary shadow-lg backdrop-blur transition-colors hover:border-brand-primary hover:bg-brand-soft focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 ${
            isHidden
              ? "ml-auto h-11 px-4"
              : "absolute right-6 top-0 z-10 h-9 w-9 -translate-y-1/2"
          }`}
        >
          {isHidden ? (
            <>
              <MdOutlineEdit size={18} aria-hidden="true" />
              <span className="text-sm font-semibold">Спросите помощника</span>
            </>
          ) : (
            <MdKeyboardArrowDown size={20} aria-hidden="true" />
          )}
        </button>
      )}
      <div hidden={isHidden}>{children}</div>
    </div>
  );
}
