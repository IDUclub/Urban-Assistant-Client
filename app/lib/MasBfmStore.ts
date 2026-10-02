import { makeAutoObservable, runInAction } from "mobx";
import SynapseClient, {
  SynapseHttpError,
  SYNAPSE_MESSAGES_PAGE_SIZE,
  type SynapseArchiveRef,
  type SynapseArtifact,
  type SynapseMessage,
  type SynapseProjectSummary,
} from "@lib/synapse/client";

const PROJECT_POLL_INTERVAL_MS = 3_000;
const TERMINAL_PROJECT_STATUSES = new Set(["completed", "failed", "cancelled"]);

function wait(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const handleAbort = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delay);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function errorText(error: unknown) {
  if (error instanceof SynapseHttpError) {
    const detail =
      error.data && typeof error.data === "object" && "detail" in error.data
        ? (error.data as { detail?: unknown }).detail
        : error.data;
    if (typeof detail === "string" && detail.trim()) {
      return detail.replaceAll("Synapse", "МАС БФМ");
    }
    return `МАС БФМ вернул ошибку ${error.status}.`;
  }
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить запрос.";
}

function sameArtifacts(
  current: SynapseArtifact[],
  incoming: SynapseArtifact[],
) {
  return (
    current.length === incoming.length &&
    current.every((artifact, index) => {
      const next = incoming[index];
      return (
        artifact.path === next.path &&
        artifact.version === next.version &&
        artifact.updated_at === next.updated_at &&
        artifact.content === next.content &&
        artifact.archive_ref_id === next.archive_ref_id
      );
    })
  );
}

function sameArchiveRefs(
  current: SynapseArchiveRef[],
  incoming: SynapseArchiveRef[],
) {
  return (
    current.length === incoming.length &&
    current.every((archiveRef, index) => {
      const next = incoming[index];
      return (
        archiveRef.ref_id === next.ref_id &&
        archiveRef.size_bytes === next.size_bytes &&
        archiveRef.preview === next.preview
      );
    })
  );
}

class MasBfmStore {
  isEnabled = false;
  draft = "";
  selectedProjectId: number | null = null;
  selectedScenarioId: number | null = null;
  synapseProjectId?: string = undefined;
  messages: SynapseMessage[] = [];
  artifacts: SynapseArtifact[] = [];
  archiveRefs: SynapseArchiveRef[] = [];
  latestSequence = 0;
  projectStatus?: string = undefined;
  isHistoryLoading = false;
  isStopping = false;
  projects: SynapseProjectSummary[] = [];
  isProjectsLoading = false;
  projectsError?: string = undefined;
  isSending = false;
  error?: string = undefined;
  monitorError?: string = undefined;
  private monitorController?: AbortController = undefined;
  private monitorTask?: Promise<void> = undefined;
  private conversationVersion = 0;
  private shouldMonitor = false;

  constructor() {
    makeAutoObservable<
      this,
      | "monitorController"
      | "monitorTask"
      | "conversationVersion"
      | "shouldMonitor"
    >(
      this,
      {
        monitorController: false,
        monitorTask: false,
        conversationVersion: false,
        shouldMonitor: false,
      },
      { autoBind: true },
    );
  }

  toggle() {
    this.isEnabled = !this.isEnabled;
    if (!this.isEnabled) {
      this.stopMonitoring();
    }
  }

  setDraft(value: string) {
    this.draft = value;
  }

  selectProject(projectId: number | null) {
    this.selectedProjectId = projectId;
    this.selectedScenarioId = null;
  }

  selectScenario(scenarioId: number | null) {
    this.selectedScenarioId = scenarioId;
  }

  private addProjectContext(content: string) {
    if (this.selectedProjectId === null) {
      return content;
    }

    const scenarioContext = this.selectedScenarioId === null
      ? ""
      : `, сценарий ${this.selectedScenarioId}`;
    return `Проект ${this.selectedProjectId}${scenarioContext}.\n\n${content}`;
  }

  connect() {
    this.shouldMonitor = true;
    this.startMonitoring();
  }

  disconnect() {
    this.shouldMonitor = false;
    this.stopMonitoring();
  }

  private upsertMessages(incoming: SynapseMessage[]) {
    if (!incoming.length) {
      return;
    }

    const messages = new Map(
      this.messages.map((message) => [message.id, message]),
    );
    incoming.forEach((message) => messages.set(message.id, message));
    this.messages = Array.from(messages.values()).sort(
      (left, right) => left.sequence - right.sequence,
    );
    this.latestSequence = Math.max(
      this.latestSequence,
      ...incoming.map((message) => message.sequence || 0),
    );
  }

  private stopMonitoring() {
    this.monitorController?.abort();
    this.monitorController = undefined;
    this.monitorTask = undefined;
  }

  private isProjectTerminal() {
    return (
      !!this.projectStatus &&
      TERMINAL_PROJECT_STATUSES.has(this.projectStatus.toLowerCase())
    );
  }

  private startMonitoring() {
    if (
      !this.shouldMonitor ||
      !this.isEnabled ||
      !this.synapseProjectId ||
      this.monitorTask
    ) {
      return;
    }

    const projectId = this.synapseProjectId;
    const controller = new AbortController();
    this.monitorController = controller;
    this.monitorTask = this.runMonitor(projectId, controller).finally(() => {
      runInAction(() => {
        if (this.monitorController === controller) {
          this.monitorController = undefined;
          this.monitorTask = undefined;
        }
      });
    });
  }

  private async runMonitor(projectId: string, controller: AbortController) {
    while (!controller.signal.aborted && this.synapseProjectId === projectId) {
      try {
        const [project, messagePage] = await Promise.all([
          SynapseClient.getProject(projectId, controller.signal),
          SynapseClient.getMessages(
            projectId,
            this.latestSequence,
            controller.signal,
          ),
        ]);
        if (controller.signal.aborted || this.synapseProjectId !== projectId) {
          return;
        }

        const incomingMessages = messagePage.messages ?? [];
        const conversationMessages = incomingMessages.filter(
          (message) => message.type !== "tool_call" && message.type !== "tool_result",
        );
        const hasMoreMessages = conversationMessages.length >= SYNAPSE_MESSAGES_PAGE_SIZE;
        const status = project.status?.trim().toLowerCase();
        const isTerminal = !!status && TERMINAL_PROJECT_STATUSES.has(status);
        let archiveRefs: SynapseArchiveRef[] | undefined;
        let archiveError: unknown;
        if (isTerminal) {
          try {
            const archivePage = await SynapseClient.listArchiveRefs(
              projectId,
              controller.signal,
            );
            archiveRefs = Array.isArray(archivePage.refs)
              ? archivePage.refs.filter((archiveRef) => !!archiveRef?.ref_id)
              : [];
          } catch (error) {
            archiveError = error;
          }
        }
        if (controller.signal.aborted || this.synapseProjectId !== projectId) {
          return;
        }

        const artifacts = Array.isArray(project.artifacts)
          ? project.artifacts.filter((artifact) => !!artifact?.path)
          : [];
        runInAction(() => {
          this.upsertMessages(incomingMessages);
          if (hasMoreMessages) {
            this.latestSequence = Math.max(
              ...conversationMessages.map((message) => message.sequence),
            );
          }
          this.isHistoryLoading = hasMoreMessages;
          this.projectStatus = status || undefined;
          const listedProject = this.projects.find(
            (project) => project.project_id === projectId,
          );
          if (listedProject && status) {
            listedProject.status = status;
          }
          if (!sameArtifacts(this.artifacts, artifacts)) {
            this.artifacts = artifacts;
          }
          if (
            archiveRefs &&
            !sameArchiveRefs(this.archiveRefs, archiveRefs)
          ) {
            this.archiveRefs = archiveRefs;
          }
          this.monitorError = archiveError
            ? `Не удалось получить список артефактов. ${errorText(archiveError)}`
            : undefined;
        });

        if (isTerminal && archiveRefs && !hasMoreMessages) {
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        runInAction(() => {
          this.monitorError = errorText(error);
        });
      }

      await wait(PROJECT_POLL_INTERVAL_MS, controller.signal);
    }
  }

  get canStop() {
    return (
      !!this.synapseProjectId &&
      !!this.projectStatus &&
      !this.isProjectTerminal()
    );
  }

  async refreshProjects() {
    if (this.isProjectsLoading) {
      return;
    }

    this.isProjectsLoading = true;

    try {
      const projects: SynapseProjectSummary[] = [];
      let offset = 0;
      while (true) {
        const page = await SynapseClient.listProjects(offset);
        projects.push(...page.projects);

        if (
          page.next_offset === null ||
          page.next_offset === undefined ||
          page.next_offset <= offset
        ) {
          break;
        }
        offset = page.next_offset;
      }
      runInAction(() => {
        this.projects = projects;
        this.projectsError = undefined;
      });
    } catch (error) {
      runInAction(() => {
        this.projectsError = errorText(error);
      });
    } finally {
      runInAction(() => {
        this.isProjectsLoading = false;
      });
    }
  }

  openProject(project: SynapseProjectSummary) {
    if (project.project_id === this.synapseProjectId) {
      return;
    }
    this.newChat();
    this.synapseProjectId = project.project_id;
    this.projectStatus = project.status;
    this.isHistoryLoading = true;
    this.startMonitoring();
  }

  async stopProject() {
    const projectId = this.synapseProjectId;

    if (!projectId || !this.canStop || this.isStopping || this.isSending) {
      return;
    }

    const conversationVersion = this.conversationVersion;
    this.isStopping = true;
    this.error = undefined;

    try {
      await SynapseClient.stopProject(projectId);

      if (conversationVersion === this.conversationVersion) {
        this.stopMonitoring();
        this.startMonitoring();
      }

      void this.refreshProjects();
    } catch (error) {
      if (conversationVersion === this.conversationVersion) {
        runInAction(() => {
          this.error = errorText(error);
        });
      }
    } finally {
      if (conversationVersion === this.conversationVersion) {
        runInAction(() => {
          this.isStopping = false;
        });
      }
    }
  }

  async sendDraft() {
    const content = this.draft.trim();
    if (!content || this.isSending || this.isStopping || this.isHistoryLoading) {
      return;
    }
    const prompt = this.addProjectContext(content);

    const conversationVersion = this.conversationVersion;
    const previousStatus = this.projectStatus;
    const previousArtifacts = this.artifacts;
    const previousArchiveRefs = this.archiveRefs;
    this.isSending = true;
    this.error = undefined;
    this.draft = "";

    if (this.synapseProjectId && this.isProjectTerminal()) {
      this.stopMonitoring();
      this.projectStatus = undefined;
      this.artifacts = [];
      this.archiveRefs = [];
    }

    try {
      if (!this.synapseProjectId) {
        const project = await SynapseClient.createProject(prompt);
        if (conversationVersion !== this.conversationVersion) {
          return;
        }
        runInAction(() => {
          this.synapseProjectId = project.project_id;
          this.projectStatus = project.status?.trim().toLowerCase();
        });
        this.startMonitoring();
        void this.refreshProjects();
      } else {
        const projectId = this.synapseProjectId;
        const message = await SynapseClient.sendMessage(projectId, prompt);
        if (conversationVersion !== this.conversationVersion) {
          return;
        }
        runInAction(() => this.upsertMessages([message]));
        this.startMonitoring();
      }
    } catch (error) {
      if (conversationVersion !== this.conversationVersion) {
        return;
      }
      runInAction(() => {
        this.error = errorText(error);
        this.draft = content;
        this.projectStatus = previousStatus;
        this.artifacts = previousArtifacts;
        this.archiveRefs = previousArchiveRefs;
      });
    } finally {
      if (conversationVersion === this.conversationVersion) {
        runInAction(() => {
          this.isSending = false;
        });
      }
    }
  }

  newChat() {
    this.conversationVersion += 1;
    this.stopMonitoring();
    this.draft = "";
    this.selectedProjectId = null;
    this.selectedScenarioId = null;
    this.synapseProjectId = undefined;
    this.messages = [];
    this.artifacts = [];
    this.archiveRefs = [];
    this.latestSequence = 0;
    this.projectStatus = undefined;
    this.isSending = false;
    this.isHistoryLoading = false;
    this.isStopping = false;
    this.error = undefined;
    this.monitorError = undefined;
  }
}

export default new MasBfmStore();
