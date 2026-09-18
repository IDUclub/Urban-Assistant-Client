import axios from "axios";
import type { Feature, FeatureCollection, Point } from "geojson";
import AuthStore from "@lib/AuthStore";

export const DOCUMENT_LEVELS = {
    federal: "Федеральный",
    regional: "Региональный",
    municipal: "Муниципальный",
};

export type DocumentLevel = keyof typeof DOCUMENT_LEVELS;

export function isDocumentLevel(value: string): value is DocumentLevel {
    return value === "federal"
        || value === "regional"
        || value === "municipal";
}

export type LibraryDocument = {
    id: string;
    name: string;
    version: string;
    territoryId: number | null;
    territoryName: string;
    documentLevel: DocumentLevel | "";
    uploadedAt: string;
};

export type TerritoryCentre = {
    territoryId: number;
    name: string;
    coordinates: [number, number];
};

type RawLibraryDocument = {
    doc_id?: unknown;
    id?: unknown;
    name?: unknown;
    version?: unknown;
    territory_id?: unknown;
    territory_name?: unknown;
    document_level?: unknown;
    uploaded_at?: unknown;
};

type LibraryDocumentsResponse = {
    documents?: unknown;
};

type TerritoryCentreProperties = {
    territory_id?: unknown;
    name?: unknown;
};

function toTrimmedString(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function toOptionalNumber(value: unknown) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseLibraryDocument(
    rawDocument: RawLibraryDocument,
    documentIndex: number,
): LibraryDocument {
    const rawDocumentLevel = toTrimmedString(rawDocument.document_level);

    return {
        id: String(rawDocument.doc_id ?? rawDocument.id ?? documentIndex),
        name: toTrimmedString(rawDocument.name) || "Без названия",
        version: String(rawDocument.version ?? ""),
        territoryId: toOptionalNumber(rawDocument.territory_id),
        territoryName: toTrimmedString(rawDocument.territory_name),
        documentLevel: isDocumentLevel(rawDocumentLevel)
            ? rawDocumentLevel
            : "",
        uploadedAt: toTrimmedString(rawDocument.uploaded_at),
    };
}

export function parseLibraryDocuments(responseData: unknown): LibraryDocument[] {
    const response = responseData as LibraryDocumentsResponse | null;
    const rawDocuments = Array.isArray(responseData)
        ? responseData
        : response?.documents;

    if (!Array.isArray(rawDocuments)) {
        throw new Error("Unexpected library response");
    }

    return rawDocuments.map((rawDocument, documentIndex) => {
        if (!rawDocument || typeof rawDocument !== "object") {
            throw new Error("Invalid library document");
        }

        return parseLibraryDocument(rawDocument, documentIndex);
    });
}

async function getAuthorizationHeaders() {
    await AuthStore.refreshTokenIfNeeded();

    if (!AuthStore.accessToken) {
        return {};
    }

    return {
        Authorization: `Bearer ${AuthStore.accessToken}`,
    };
}

export async function getLibraryDocuments(
    signal: AbortSignal,
): Promise<LibraryDocument[]> {
    const headers = await getAuthorizationHeaders();

    const { data } = await axios.get(
        `${import.meta.env.VITE_DOCUMENTS_API}/library/documents`,
        {
            headers,
            signal,
        },
    );

    return parseLibraryDocuments(data);
}

function parseTerritoryCentre(
    feature: Feature<Point, TerritoryCentreProperties>,
): TerritoryCentre | null {
    const territoryId = toOptionalNumber(
        feature.properties?.territory_id ?? feature.id,
    );
    const coordinates = feature.geometry?.coordinates;

    if (
        territoryId === null ||
        !Array.isArray(coordinates) ||
        !Number.isFinite(coordinates[0]) ||
        !Number.isFinite(coordinates[1])
    ) {
        return null;
    }

    return {
        territoryId,
        name: toTrimmedString(feature.properties?.name),
        coordinates: [coordinates[0], coordinates[1]],
    };
}

export async function getTerritoryCentres(
    territoryIds: number[],
    signal: AbortSignal,
): Promise<TerritoryCentre[]> {
    if (!territoryIds.length) {
        return [];
    }

    const headers = await getAuthorizationHeaders();
    const territoryIdsPath = territoryIds.join(",");
    const { data } = await axios.get<
        FeatureCollection<Point, TerritoryCentreProperties>
    >(
        `${import.meta.env.VITE_URBAN_API}/territories/${territoryIdsPath}`,
        {
            headers,
            signal,
            params: {
                centers_only: true,
            },
        },
    );

    if (!Array.isArray(data?.features)) {
        throw new Error("Unexpected territory centres response");
    }

    return data.features.flatMap((feature) => {
        const territoryCentre = parseTerritoryCentre(feature);

        return territoryCentre ? [territoryCentre] : [];
    });
}
