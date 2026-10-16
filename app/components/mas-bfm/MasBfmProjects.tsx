import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { MdRefresh, MdSearch } from "react-icons/md";
import MasBfmStore from "@lib/MasBfmStore";
import MasBfmProjectStatus from "@components/mas-bfm/MasBfmProjectStatus";

const MasBfmProjects = observer(() => {
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    void MasBfmStore.refreshProjects();
    const intervalId = window.setInterval(
      () => void MasBfmStore.refreshProjects(),
      10_000,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleProjects = MasBfmStore.projects.filter((project) =>
    (project.title || project.user_prompt || project.project_id)
      .toLowerCase()
      .includes(normalizedSearchQuery),
  );

  return (
    <>
      <div className="flex items-center justify-between border-t border-(--sidebar-divider-color) px-4 py-4 text-sm font-medium uppercase tracking-[0.14em] text-(--history-heading-color)">
        <span>Проекты МАС БФМ</span>
        <button
          type="button"
          aria-label="Обновить список проектов"
          onClick={() => void MasBfmStore.refreshProjects()}
          disabled={MasBfmStore.isProjectsLoading}
          className="cursor-pointer rounded-full p-1 hover:text-brand-primary disabled:opacity-40"
        >
          <MdRefresh size={20} />
        </button>
      </div>
      <label className="mx-2 mb-2 flex items-center gap-2 rounded-3xl border border-ui-border px-3 py-2 text-content-muted">
        <MdSearch size={20} />
        <input
          aria-label="Поиск по проектам МАС БФМ"
          placeholder="Поиск по проектам"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-content-primary outline-none"
        />
      </label>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2">
        {MasBfmStore.projectsError && (
          <p role="alert" className="px-3 py-2 text-sm text-red-600">
            {MasBfmStore.projectsError}
          </p>
        )}
        {!visibleProjects.length && (
          <p className="px-3 py-2 text-sm text-content-muted">
            {MasBfmStore.isProjectsLoading
              ? "Загрузка проектов…"
              : normalizedSearchQuery
                ? "Ничего не найдено"
                : "Проектов пока нет"}
          </p>
        )}
        {visibleProjects.map((project) => {
          const title = project.title || project.user_prompt || project.project_id;
          const isActive = project.project_id === MasBfmStore.synapseProjectId;
          return (
            <button
              key={project.project_id}
              type="button"
              title={title}
              aria-current={isActive ? "page" : undefined}
              onClick={() => MasBfmStore.openProject(project)}
              className={`block w-full min-w-0 cursor-pointer rounded-3xl px-4 py-3 text-left text-sm transition-colors ${
                isActive
                  ? "bg-brand-soft text-brand-primary"
                  : "text-content-primary hover:bg-surface-hover"
              }`}
            >
              <span className="mb-1 block truncate">{title}</span>
              <MasBfmProjectStatus status={project.status} />
            </button>
          );
        })}
      </div>
    </>
  );
});

export default MasBfmProjects;
