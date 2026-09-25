import { observer } from "mobx-react-lite";
import { useLocation } from "react-router";
import { LuNetwork } from "react-icons/lu";
import MasBfmStore from "@lib/MasBfmStore";

const MasBfmToggle = observer(() => {
  const { pathname } = useLocation();
  if (pathname !== "/chat") {
    return null;
  }

  return (
    <button
      type="button"
      aria-label="МАС БФМ"
      aria-pressed={MasBfmStore.isEnabled}
      title="МАС БФМ"
      onClick={() => MasBfmStore.toggle()}
      className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border px-3 shadow-lg backdrop-blur transition-colors hover:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/20 ${
        MasBfmStore.isEnabled
          ? "border-brand-primary bg-brand-soft text-brand-primary"
          : "border-ui-border bg-surface-raised/95 text-content-secondary hover:bg-brand-soft"
      }`}
    >
      <LuNetwork size={21} aria-hidden="true" />
      <span className="text-xs font-semibold">МАС БФМ</span>
    </button>
  );
});

export default MasBfmToggle;
