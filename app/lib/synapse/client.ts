import AuthStore from "@lib/AuthStore";

const DEFAULT_WORKFLOW_ID = "urban_school_provisioning";
const SYNAPSE_PROXY_URL = "/api/synapse";

type SynapseRunConfiguration = {
  _id: string;
  name: string;
  is_default: boolean;
};

type SynapseWorkflow = {
  id?: string;
  _id?: string;
  name: string;
};

export type SynapseProjectSummary = {
  project_id: string;
  status: string;
};

export type SynapseArtifact = {
  path: string;
  content?: string | null;
  version?: number;
  run_id?: string | null;
  updated_at?: string | null;
  spilled?: boolean;
  archive_ref_id?: string | null;
  size_bytes?: number | null;
  content_type?: string | null;
};

export type SynapseArchiveRef = {
  ref_id: string;
  size_bytes?: number | null;
  content_type?: string | null;
  tool_id?: string | null;
  run_id?: string | null;
  path?: string | null;
  preview?: string | null;
};

export type SynapseProject = {
  status: string;
  artifacts?: SynapseArtifact[];
};

export type SynapseMessage = {
  id: string;
  sequence: number;
  type: string;
  status?: string;
  subtype?: string;
  content?: unknown;
  data?: unknown;
  created_at?: string | null;
};

type SynapseMessagesResponse = {
  messages: SynapseMessage[];
};

type SynapseConfig = {
  workflowId: string;
  runConfigId?: string;
};

export class SynapseHttpError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`МАС БФМ вернул ошибку ${status}`);
    this.name = "SynapseHttpError";
    this.status = status;
    this.data = data;
  }
}

function getConfig(): SynapseConfig {
  return {
    workflowId:
      String(import.meta.env.VITE_SYNAPSE_WORKFLOW_ID ?? "").trim() ||
      DEFAULT_WORKFLOW_ID,
    runConfigId:
      String(import.meta.env.VITE_SYNAPSE_RUN_CONFIG_ID ?? "").trim() ||
      undefined,
  };
}

function parseJson(text: string): unknown {
  if (!text) {
    return;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

class SynapseClient {
  private resolvedRunConfigId?: string;
  private resolvedWorkflowId?: string;

  private async readResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    const data = parseJson(text);
    if (!response.ok) {
      throw new SynapseHttpError(response.status, data);
    }
    return data as T;
  }

  private async authorizedFetch(
    path: string,
    init: RequestInit = {},
    retry = true,
  ): Promise<Response> {
    await AuthStore.refreshTokenIfNeeded();
    if (!AuthStore.accessToken) {
      throw new Error("Пользователь не авторизован.");
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${AuthStore.accessToken}`);

    const response = await fetch(`${SYNAPSE_PROXY_URL}${path}`, {
      ...init,
      headers,
    });
    if (response.status === 401 && retry) {
      await AuthStore.refreshTokenIfNeeded(-1);
      return this.authorizedFetch(path, init, false);
    }
    return response;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.authorizedFetch(path, init);
    return this.readResponse<T>(response);
  }

  async listRunConfigurations() {
    return this.request<SynapseRunConfiguration[]>(
      "/configurations/run-configurations/",
    );
  }

  async getDefaultRunConfigurationId() {
    const configuredId = getConfig().runConfigId;
    if (configuredId) {
      return configuredId;
    }

    if (this.resolvedRunConfigId) {
      return this.resolvedRunConfigId;
    }

    const configurations = await this.listRunConfigurations();
    const selected =
      configurations.find((configuration) => configuration._id === "default") ??
      configurations.find((configuration) => configuration.is_default) ??
      configurations.find(
        (configuration) =>
          configuration.name.trim().toLowerCase() === "default",
      );

    if (!selected?._id) {
      throw new Error('Synapse run configuration "Default" was not found.');
    }

    this.resolvedRunConfigId = selected._id;
    return selected._id;
  }

  async listWorkflows() {
    return this.request<SynapseWorkflow[]>(
      "/configurations/workflows/?enabled_only=true",
    );
  }

  async getWorkflowId() {
    if (this.resolvedWorkflowId) {
      return this.resolvedWorkflowId;
    }

    const configuredWorkflow = getConfig().workflowId;
    const workflows = await this.listWorkflows();
    const selected = workflows.find(
      (workflow) =>
        workflow.id === configuredWorkflow ||
        workflow._id === configuredWorkflow ||
        workflow.name === configuredWorkflow,
    );
    const workflowId = selected?.id ?? selected?._id;
    if (!workflowId) {
      throw new Error(
        `Конфигурация МАС БФМ "${configuredWorkflow}" не найдена.`,
      );
    }

    this.resolvedWorkflowId = workflowId;
    return workflowId;
  }

  async createProject(userPrompt: string) {
    const prompt = userPrompt.trim();
    if (!prompt) {
      throw new Error("Запрос МАС БФМ не может быть пустым.");
    }

    const [runConfigId, workflowId] = await Promise.all([
      this.getDefaultRunConfigurationId(),
      this.getWorkflowId(),
    ]);
    return this.request<SynapseProjectSummary>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_prompt: prompt,
        workflow_id: workflowId,
        run_config_id: runConfigId,
        approval_mode: "auto",
      }),
    });
  }

  async sendMessage(projectId: string, content: string) {
    const message = content.trim();
    if (!message) {
      throw new Error("Сообщение МАС БФМ не может быть пустым.");
    }

    return this.request<SynapseMessage>(`/projects/${projectId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message, metadata: {} }),
    });
  }

  async getProject(projectId: string, signal?: AbortSignal) {
    return this.request<SynapseProject>(`/projects/${projectId}`, { signal });
  }

  async getMessages(projectId: string, after = 0, signal?: AbortSignal) {
    const params = new URLSearchParams({
      after: String(after),
      limit: "1000",
      include_journal: "true",
    });
    return this.request<SynapseMessagesResponse>(
      `/projects/${projectId}/messages?${params}`,
      { signal },
    );
  }

  async getArchiveDownloadUrl(projectId: string, archiveRefId: string) {
    return this.request<{ url: string }>(
      `/projects/${projectId}/archive/${archiveRefId}/download-url`,
    );
  }

  async listArchiveRefs(projectId: string, signal?: AbortSignal) {
    return this.request<{ refs: SynapseArchiveRef[] }>(
      `/projects/${projectId}/archive?limit=100`,
      { signal },
    );
  }

  async getArchiveContent(
    projectId: string,
    archiveRefId: string,
    signal?: AbortSignal,
  ) {
    const response = await this.authorizedFetch(
      `/projects/${projectId}/archive/${archiveRefId}/content`,
      { signal },
    );
    if (!response.ok) {
      throw new SynapseHttpError(
        response.status,
        parseJson(await response.text()),
      );
    }
    return response.text();
  }
}

export default new SynapseClient();
