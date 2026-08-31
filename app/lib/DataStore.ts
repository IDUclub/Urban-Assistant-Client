import axios from "axios";
import { makeAutoObservable, action, runInAction } from "mobx";
import type { Geometry, MultiPolygon, Point, Polygon } from "geojson";
import AuthStore from "@lib/AuthStore";

export type ProjectCreationTerritoryOption = {
    territory_id: number;
    name: string;
};

export type ProjectCreationTerritory = ProjectCreationTerritoryOption & {
    geometry: Geometry;
    centre_point?: Point | null;
};

export type ProjectScenario = {
    id: number;
    name: string;
    isBase: boolean;
};

export type FunctionalZoneType = {
    id: number;
    name: string;
    zoneNickname: string | null;
    description: string | null;
};

export type CreateScenarioPayload = {
    project_id: number;
    functional_zone_type_id: number;
    name: string;
    properties: Record<string, unknown>;
};

export type CreateProjectPayload = {
    name: string;
    territory_id: number;
    public: false;
    territory: {
        geometry: Polygon | MultiPolygon;
        centre_point: Point;
        properties: Record<string, unknown>;
    };
};

export type CreatedProject = {
    project_id?: number;
    id?: number;
    name?: string;
    base_scenario?: {
        id?: number;
        scenario_id?: number;
        name?: string;
    } | null;
    base_scenario_id?: number;
    scenario_id?: number;
    project?: {
        project_id?: number;
        id?: number;
        name?: string;
        base_scenario?: {
            id?: number;
            scenario_id?: number;
            name?: string;
        } | null;
        base_scenario_id?: number;
        scenario_id?: number;
    };
};

function normalizeProjectScenario(value: any): ProjectScenario | null {
    const scenarioId = Number(value?.scenario_id ?? value?.id);
    const scenarioName = typeof value?.name === "string"
        ? value.name.trim()
        : "";

    if (!Number.isFinite(scenarioId) || !scenarioName) return null;

    return {
        id: scenarioId,
        name: scenarioName,
        isBase: value?.is_based === true
            || value?.is_base === true
            || value?.is_base_scenario === true
            || value?.is_baseline === true
            || value?.is_default === true
            || value?.base === true
            || value?.type === "base",
    };
}

class AppDataStore {
    userProjects?: {name: string; id: number; }[] = [];
    projectScenarios: Map<number, ProjectScenario[]> = new Map();
    functionalZoneTypes: FunctionalZoneType[] | null = null;
    projectTerritories: Map<number, any | null> = new Map();
    projectTerritoryRequests: Map<number, Promise<any | null>> = new Map();

    getUserProjects() {
        return axios.get(
            `${import.meta.env.VITE_URBAN_API}/projects`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
                params: {
                    only_own: true,
                    page_size: 500,
                }
            }
        )
        .then(
            action(
                ({ data }) => {
                    if (data && data.results &&
                        Array.isArray(data.results) && data.results.length > 0
                    ) {
                        const formattedProjects = data.results.map(
                            (project: any) => ({
                                name: project.name,
                                id: project.project_id,
                            })
                        )
                        this.userProjects = formattedProjects;
                        return data.results;
                    }
                    return [];
                }
            )
        )
        .catch(error => {
            console.error("Error fetching user projects:", error);
            return [];
        });
    };

    async getProjectCreationTerritories(): Promise<ProjectCreationTerritoryOption[]> {
        const { data } = await axios.get(
            `${import.meta.env.VITE_URBAN_API}/all_territories_without_geometry`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
                params: {
                    parent_id: 12639,
                    get_all_levels: false,
                    cities_only: false,
                    ordering: "asc",
                },
            },
        );

        if (!Array.isArray(data)) return [];

        return data
            .flatMap((territory): ProjectCreationTerritoryOption[] => {
                const territoryId = Number(territory?.territory_id);
                const name = typeof territory?.name === "string"
                    ? territory.name.trim()
                    : "";

                return Number.isFinite(territoryId) && name
                    ? [{ territory_id: territoryId, name }]
                    : [];
            })
            .sort((left, right) => (
                left.name.localeCompare(right.name, "ru", {
                    sensitivity: "base",
                })
            ));
    }

    async getProjectCreationTerritory(
        territoryId: number,
    ): Promise<ProjectCreationTerritory> {
        const { data } = await axios.get(
            `${import.meta.env.VITE_URBAN_API}/territory/${territoryId}`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
            },
        );

        return data as ProjectCreationTerritory;
    }

    async createProject(payload: CreateProjectPayload): Promise<CreatedProject> {
        const { data } = await axios.post(
            `${import.meta.env.VITE_URBAN_API}/projects`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                    "Content-Type": "application/json",
                },
            },
        );

        const refreshedProjects = await this.getUserProjects();
        const responseProject = data?.project ?? data;
        const responseProjectId = Number(
            responseProject?.project_id
            ?? responseProject?.id,
        );
        const refreshedProject = refreshedProjects.find((project: any) => (
            Number.isFinite(responseProjectId)
                ? Number(project?.project_id ?? project?.id) === responseProjectId
                : project?.name === payload.name
        ));

        return {
            ...(data && typeof data === "object" ? data : {}),
            project_id: Number.isFinite(responseProjectId)
                ? responseProjectId
                : Number(refreshedProject?.project_id ?? refreshedProject?.id),
            name: responseProject?.name ?? refreshedProject?.name ?? payload.name,
            base_scenario: responseProject?.base_scenario
                ?? data?.base_scenario
                ?? refreshedProject?.base_scenario,
        } as CreatedProject;
    }

    getProjectScenarios(projectId: number): Promise<ProjectScenario[]> {
        const currentScenarios = this.projectScenarios.get(projectId);

        if (currentScenarios) return Promise.resolve(currentScenarios);

        return axios.get(
            `${import.meta.env.VITE_URBAN_API}/projects/${projectId}/scenarios`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
            }
        )
        .then(
            action(
                ({ data }): ProjectScenario[] => {
                    if (!Array.isArray(data)) return [];

                    const formattedScenarios = data.flatMap((scenario: any) => {
                        const normalizedScenario = normalizeProjectScenario(scenario);
                        return normalizedScenario ? [normalizedScenario] : [];
                    });

                    this.projectScenarios.set(projectId, formattedScenarios);
                    return formattedScenarios;
                }
            )
        )
        .catch(error => {
            console.error("Error fetching project scenarios:", error);
            return [];
        });
    };

    async getFunctionalZoneTypes(): Promise<FunctionalZoneType[]> {
        if (this.functionalZoneTypes) return this.functionalZoneTypes;

        const { data } = await axios.get(
            `${import.meta.env.VITE_URBAN_API}/functional_zones_types`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
            },
        );
        const functionalZoneTypes = Array.isArray(data)
            ? data.flatMap((zoneType: any) => {
                const id = Number(zoneType?.functional_zone_type_id ?? zoneType?.id);
                const name = typeof zoneType?.name === "string"
                    ? zoneType.name.trim()
                    : "";

                if (!Number.isFinite(id) || !name) return [];

                return [{
                    id,
                    name,
                    zoneNickname: typeof zoneType?.zone_nickname === "string"
                        && zoneType.zone_nickname.trim()
                        ? zoneType.zone_nickname.trim()
                        : null,
                    description: typeof zoneType?.description === "string"
                        && zoneType.description.trim()
                        ? zoneType.description.trim()
                        : null,
                }];
            })
            : [];

        runInAction(() => {
            this.functionalZoneTypes = functionalZoneTypes;
        });

        return functionalZoneTypes;
    }

    async createProjectScenario(
        baseScenarioId: number,
        payload: CreateScenarioPayload,
    ): Promise<ProjectScenario> {
        const { data } = await axios.post(
            `${import.meta.env.VITE_URBAN_API}/scenarios/${baseScenarioId}`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                    "Content-Type": "application/json",
                },
            },
        );
        const createdScenario = normalizeProjectScenario(data);

        if (!createdScenario) {
            throw new Error("Scenario creation response is invalid");
        }

        runInAction(() => {
            const currentScenarios = this.projectScenarios.get(payload.project_id) ?? [];
            this.projectScenarios.set(payload.project_id, [
                ...currentScenarios.filter((scenario) => scenario.id !== createdScenario.id),
                createdScenario,
            ]);
        });

        return createdScenario;
    }

    constructor() {
        makeAutoObservable(this);
    }

    getProjectTerritory(projectId: number) {
        if (this.projectTerritories.has(projectId)) {
            return Promise.resolve(this.projectTerritories.get(projectId) ?? null);
        }

        const currentRequest = this.projectTerritoryRequests.get(projectId);
        if (currentRequest) {
            return currentRequest;
        }

        const request = axios.get(
            `${import.meta.env.VITE_URBAN_API}/projects/${projectId}/territory`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
            },
        )
        .then(({ data }) => {
            const geometry =
                data?.geometry ??
                data?.territory?.geometry ??
                data?.result?.geometry ??
                data?.territory ??
                data?.result ??
                data ??
                null;
            this.projectTerritories.set(projectId, geometry);
            return geometry;
        })
        .catch(error => {
            console.error("Error fetching project territory:", error);
            return null;
        })
        .finally(action(() => {
            this.projectTerritoryRequests.delete(projectId);
        }));

        this.projectTerritoryRequests.set(projectId, request);

        return request;
    }

    getProjectScenarioName(scenarioId: number) {
        return axios.get(
            `${import.meta.env.VITE_URBAN_API}/scenarios/${scenarioId}`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
            }
        )
        .then(({ data }) => {
            return data && data.name && data.project?.name ? `${data.project.name} / ${data.name}` : `Сценарий #${scenarioId}`;
        })
        .catch(error => {
            console.error("Error fetching scenario name:", error);
            return `Сценарий #${scenarioId}`;
        })
    }

    getProjectIdByScenario(scenarioId: number) {
        return axios.get(
            `${import.meta.env.VITE_URBAN_API}/scenarios/${scenarioId}`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
            }
        )
        .then(({ data }) => {
            return data?.project?.project_id ?? null;
        })
        .catch(error => {
            console.error("Error fetching project ID by scenario:", error);
            return null;
        })
    }

    getScenarioZoneSources(scenarioId: number) {
        return axios.get(
            `${import.meta.env.VITE_URBAN_API}/scenarios/${scenarioId}/functional_zone_sources`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
            }
        )
        .then(({ data }) => {
            return data && Array.isArray(data) ? data : [];
        })
        .catch(error => {
            console.error("Error fetching scenario zone sources:", error);
            return [];
        })
    }
}

const DataStore = new AppDataStore();

export default DataStore;
