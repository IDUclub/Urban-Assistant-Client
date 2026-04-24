import { makeAutoObservable, runInAction } from "mobx";
import Keycloak from "keycloak-js";

const keycloakConfig = {
    url: import.meta.env.VITE_KEYCLOAK_AUTH_URL,
    realm: import.meta.env.VITE_KEYCLOAK_AUTH_REALM,
    clientId: import.meta.env.VITE_KEYCLOAK_AUTH_CLIENT,
};

type AuthStatus = "idle" | "initializing" | "ready" | "error";

class AuthDataStore {
    keycloakAdapter: InstanceType<typeof Keycloak>;
    status: AuthStatus = "idle";
    authenticated = false;
    accessToken?: string = undefined;
    refreshToken?: string = undefined;
    username?: string = undefined;
    firstName?: string = undefined;
    lastName?: string = undefined;
    private initPromise?: Promise<boolean> = undefined;

    constructor() {
        this.keycloakAdapter = new Keycloak(keycloakConfig);
        makeAutoObservable(this, {}, { autoBind: true });
        this.bindKeycloakEvents();
    }

    get isReady() {
        return this.status === "ready";
    }

    get isAuthenticated() {
        return this.isReady && this.authenticated;
    }

    init() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.status = "initializing";
        this.initPromise = this.keycloakAdapter
            .init({
                onLoad: "check-sso",
                pkceMethod: "S256",
                enableLogging: true,
                checkLoginIframe: false,
            })
            .then((authenticated) => {
                runInAction(() => {
                    this.authenticated = authenticated;
                    this.syncFromKeycloak();
                    this.status = "ready";
                });

                return authenticated;
            })
            .catch((error) => {
                runInAction(() => {
                    this.status = "error";
                    this.clearSession();
                });
                throw error;
            });

        return this.initPromise;
    }

    async refreshTokenIfNeeded(minValidity = 30) {
        if (!this.authenticated) {
            return false;
        }

        const refreshed = await this.keycloakAdapter.updateToken(minValidity);
        runInAction(() => {
            this.syncFromKeycloak();
        });
        return refreshed;
    }

    loginUser() {
        return this.keycloakAdapter.login();
    }

    logoutUser() {
        return this.keycloakAdapter.logout({
            redirectUri: "http://localhost:5173/",
        })
        .finally(() => {
            setTimeout(() => this.clearSession(), 500)
        })
    }

    private bindKeycloakEvents() {
        this.keycloakAdapter.onAuthSuccess = () => {
            runInAction(() => {
                this.authenticated = true;
                this.syncFromKeycloak();
            });
        };

        this.keycloakAdapter.onAuthLogout = () => {
            runInAction(() => {
                this.authenticated = false;
                this.clearSession();
            });
        };

        this.keycloakAdapter.onAuthRefreshSuccess = () => {
            runInAction(() => {
                this.syncFromKeycloak();
            });
        };

        this.keycloakAdapter.onTokenExpired = async () => {
            try {
                await this.refreshTokenIfNeeded();
            } catch {
                await this.logoutUser();
            }
        };
    }

    private syncFromKeycloak() {
        const tokenParsed = this.keycloakAdapter.tokenParsed;

        this.authenticated = !!this.keycloakAdapter.authenticated;
        this.accessToken = this.keycloakAdapter.token;
        this.refreshToken = this.keycloakAdapter.refreshToken;
        this.username =
            tokenParsed?.preferred_username ??
            tokenParsed?.email ??
            tokenParsed?.sub;
        this.firstName = tokenParsed?.given_name;
        this.lastName = tokenParsed?.family_name;
    }

    private clearSession() {
        this.accessToken = undefined;
        this.refreshToken = undefined;
        this.username = undefined;
        this.firstName = undefined;
        this.lastName = undefined;
    }
}

const AuthStore = new AuthDataStore();

export default AuthStore;
