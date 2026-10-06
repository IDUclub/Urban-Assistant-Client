import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { LuFiles, LuX } from "react-icons/lu";
import MasBfmStore from "@lib/MasBfmStore";
import MasBfmArtifacts from "@components/mas-bfm/MasBfmArtifacts";

const MasBfmChatFiles = observer(() => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isMasBfmEnabled = MasBfmStore.isEnabled;
  const projectId = MasBfmStore.synapseProjectId;

  useEffect(() => {
    setIsOpen(false);
  }, [isMasBfmEnabled, projectId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!isMasBfmEnabled || !projectId) {
    return null;
  }

  const hasFiles = MasBfmStore.artifacts.length > 0 || MasBfmStore.archiveRefs.length > 0;
  const isLoading = MasBfmStore.isHistoryLoading;
  const loadError = MasBfmStore.monitorError;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Файлы чата"
        title="Файлы чата"
        aria-expanded={isOpen}
        aria-controls="chat-files-panel"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-ui-border bg-surface-raised/95 text-brand-primary shadow-lg backdrop-blur transition-colors hover:border-brand-primary hover:bg-brand-soft focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
      >
        <LuFiles size={20} aria-hidden="true" />
      </button>
      {isOpen && (
        <section id="chat-files-panel" aria-label="Файлы текущего чата" className="fixed right-4 top-18 flex max-h-[calc(100dvh-5.5rem)] w-[min(26rem,calc(100vw-2rem))] flex-col rounded-2xl border border-ui-border bg-surface-panel text-content-primary shadow-lg">
          <div className="flex items-center justify-between border-b border-ui-border px-4 py-3">
            <h2 className="font-semibold">Файлы чата</h2>
            <button
              type="button"
              aria-label="Закрыть файлы чата"
              onClick={() => {
                setIsOpen(false);
                buttonRef.current?.focus();
              }}
              className="cursor-pointer rounded-lg p-2 hover:bg-brand-soft"
            >
              <LuX size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto p-4">
            {loadError && <p role="alert" className="mb-3 text-sm text-red-600 customer-dark:text-red-300">{loadError}</p>}
            {isLoading ? <p className="text-sm text-content-muted">Загрузка файлов…</p> : (
              <>
                <h3 className="mb-3 text-sm font-semibold">Созданные в чате</h3>
                {!hasFiles && !loadError && <p className="text-sm text-content-muted">Пока нет файлов</p>}
                {hasFiles && (
                  <MasBfmArtifacts
                    key={projectId}
                    artifacts={MasBfmStore.artifacts}
                    archiveRefs={MasBfmStore.archiveRefs}
                    projectId={projectId}
                    listOnly
                  />
                )}
                <h3 className="mb-3 mt-5 border-t border-ui-border pt-4 text-sm font-semibold">Загруженные</h3>
                <p className="text-sm text-content-muted">...</p>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
});

export default MasBfmChatFiles;
