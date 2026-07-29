export default function PageLoader() {
  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center overflow-hidden bg-surface-page">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgb(var(--brand-primary-rgb)/0.10),transparent_34%),radial-gradient(circle_at_46%_66%,rgb(var(--brand-gradient-end-rgb)/0.12),transparent_30%)]" />
      <video
        className="relative h-32 w-32 object-contain sm:h-64 sm:w-64"
        src="/logo-loader.webm"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-label="Загрузка"
      />
    </div>
  );
}
