export const ZONE_TYPES = [
    { value: 10, label: "Жилая застройка — ИЖС" },
    { value: 11, label: "Жилая застройка — Малоэтажная" },
    { value: 12, label: "Жилая застройка — Среднеэтажная" },
    { value: 13, label: "Жилая застройка — Многоэтажная" },
    { value: 1, label: "Жилая зона" },
    { value: 7, label: "Общественно-деловая" },
    { value: 2, label: "Рекреационная" },
    { value: 3, label: "Специального назначения" },
    { value: 4, label: "Промышленная" },
    { value: 5, label: "Сельскохозяйственная" },
    { value: 6, label: "Транспортная инженерная" },
] as const;

export type ZonePair = [number, number];

export type MatrixCellValue = "allow" | "deny" | null;

export type ZoneAdjacencyMatrixState = Record<
    number,
    Record<number, MatrixCellValue>
>;

export type DefaultZoneAdjacencyMatrixResponse = {
    forbidden_pairs: ZonePair[];
};

export function createInitialZoneAdjacencyMatrix(): ZoneAdjacencyMatrixState {
    const matrix: ZoneAdjacencyMatrixState = {};

    ZONE_TYPES.forEach((rowZone) => {
        matrix[rowZone.value] = {};

        ZONE_TYPES.forEach((columnZone) => {
            matrix[rowZone.value][columnZone.value] = null;
        });
    });

    return matrix;
}

export function applyForbiddenPairsToMatrix(
    forbiddenPairs: ZonePair[],
): ZoneAdjacencyMatrixState {
    const matrix = createInitialZoneAdjacencyMatrix();

    forbiddenPairs.forEach(([firstZoneId, secondZoneId]) => {
        if (matrix[firstZoneId]?.[secondZoneId] !== undefined) {
            matrix[firstZoneId][secondZoneId] = "deny";
        }

        if (matrix[secondZoneId]?.[firstZoneId] !== undefined) {
            matrix[secondZoneId][firstZoneId] = "deny";
        }
    });

    return matrix;
}

export function updateMatrixCell(
    matrix: ZoneAdjacencyMatrixState,
    firstZoneId: number,
    secondZoneId: number,
    value: MatrixCellValue,
): ZoneAdjacencyMatrixState {
    if (firstZoneId === secondZoneId) {
        return matrix;
    }

    return {
        ...matrix,
        [firstZoneId]: {
            ...matrix[firstZoneId],
            [secondZoneId]: value,
        },
        [secondZoneId]: {
            ...matrix[secondZoneId],
            [firstZoneId]: value,
        },
    };
}

export function getPairsFromMatrix(matrix: ZoneAdjacencyMatrixState) {
    const neighbourPairs: ZonePair[] = [];
    const forbiddenPairs: ZonePair[] = [];
    const zoneIds = Object.keys(matrix).map(Number);

    zoneIds.forEach((rowZoneId) => {
        zoneIds.forEach((columnZoneId) => {
            if (rowZoneId >= columnZoneId) {
                return;
            }

            const value = matrix[rowZoneId]?.[columnZoneId];

            if (value === "allow") {
                neighbourPairs.push([rowZoneId, columnZoneId]);
            }

            if (value === "deny") {
                forbiddenPairs.push([rowZoneId, columnZoneId]);
            }
        });
    });

    return {
        neighbourPairs,
        forbiddenPairs,
    };
}