export default function PageLoader() {
  const faceClass =
    "absolute inset-0 overflow-hidden rounded-[20px] border border-white/50 bg-linear-to-br from-brand-gradient-start/42 via-brand-gradient-middle/34 to-brand-gradient-end/32 shadow-[inset_0_1px_14px_rgba(255,255,255,0.38),0_18px_45px_var(--brand-shadow-soft)] backdrop-blur-md";
  const faceHighlightClass =
    "absolute inset-0 bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.48),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.24),transparent_44%)]";
  const renderFace = (transformClass: string) => (
    <span className={`${faceClass} ${transformClass}`}>
      <span className={faceHighlightClass} />
      <img
        src="/png/idu_logo.png"
        alt=""
        className="brand-logo absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 object-contain opacity-85 drop-shadow-[0_6px_12px_var(--shadow-logo)]"
        draggable={false}
      />
      <span className="absolute inset-x-3 top-2 h-px rounded-full bg-white/80" />
      <span className="absolute bottom-2 right-2 h-5 w-5 rounded-full bg-brand-gradient-end/18 blur-md" />
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center overflow-hidden bg-surface-page">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgb(var(--brand-primary-rgb)/0.10),transparent_34%),radial-gradient(circle_at_46%_66%,rgb(var(--brand-gradient-end-rgb)/0.12),transparent_30%)]" />
      <div className="relative flex flex-col items-center gap-7">
        <div className="h-18 w-18 perspective-[420px]">
          <div className="relative h-18 w-18 animate-[loader-cube-spin_1.8s_infinite_ease-in-out] transform-3d">
            <div className="absolute inset-0 rounded-3xl bg-brand-primary/20 blur-2xl transform-[translateZ(-44px)_scale(1.45)]" />
            {renderFace("[transform:translateZ(36px)]")}
            {renderFace("[transform:rotateY(180deg)_translateZ(36px)]")}
            {renderFace("[transform:rotateY(90deg)_translateZ(36px)]")}
            {renderFace("[transform:rotateY(-90deg)_translateZ(36px)]")}
            {renderFace("[transform:rotateX(90deg)_translateZ(36px)]")}
            {renderFace("[transform:rotateX(-90deg)_translateZ(36px)]")}
          </div>
        </div>
      </div>
    </div>
  );
}
