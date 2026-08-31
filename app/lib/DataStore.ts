import axios from "axios";
import { makeAutoObservable, action } from "mobx";
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

class AppDataStore {
    userProjects?: {name: string; id: number; }[] = [];
    projectScenarios: Map<number, any> = new Map();
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

    getProjectScenarios(projectId: number) {
        if (this.projectScenarios.has(projectId)) return;

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
                ({ data }) => {
                    if (data && Array.isArray(data) && data.length) {
                        const formattedScenarios = data.map((scenario: any) => ({
                            id: scenario.scenario_id,
                            name: scenario.name,
                        }))
                        this.projectScenarios.set(projectId, formattedScenarios);
                    }
                }
            )
        )
        .catch(error => {
            console.error("Error fetching project scenarios:", error);
        })
    };

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
