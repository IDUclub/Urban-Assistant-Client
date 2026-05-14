import axios from "axios";
import { makeAutoObservable, action } from "mobx";
import AuthStore from "@lib/AuthStore";

class AppDataStore {
    userProjects?: {name: string; id: number; }[] = [];
    projectScenarios: Map<number, any> = new Map();
    projectTerritories: Map<number, any | null> = new Map();
    projectTerritoryRequests: Map<number, Promise<any | null>> = new Map();
    nonProjectStages?: string[];

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

    getNonProjectStages() {
        return axios.get(
            `${import.meta.env.VITE_LLM_API}/llm/indexes`,
        )
        .then(
            action(
                ({ data }) => {
                    if (data && Array.isArray(data) && data.length) {
                        this.nonProjectStages = data;
                    }
                }
            )
        )
        .catch(error => {
            console.error("Error fetching llm stages:", error);
        })
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
            const geometry = data && data.geometry ? data.geometry : null;
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
}

const DataStore = new AppDataStore();

export default DataStore;
