export const FUNCTIONAL_ZONE_FALLBACK_COLOR = "#969696";
export const FUNCTIONAL_ZONE_ID_PROPERTY = "territory_zone";
export const FUNCTIONAL_ZONE_NAME_PROPERTY = "Территориальная зона";

const FUNCTIONAL_ZONE_COLORS_BY_ID: Record<number, string> = {
    1: "#FFD700",
    2: "#ADFF2F",
    3: "#8B4513",
    4: "#6A5ACD",
    5: "#20B2AA",
    6: "#A9A9A9",
    7: "#FF8C00",
    10: "#f5e345",
    11: "#faaf1c",
    12: "#f26142",
    13: "#782b2b",
};

const FUNCTIONAL_ZONE_NAMES_BY_ID: Record<number, string> = {
    1: "Жилая зона",
    2: "Рекреационная зона",
    3: "Особого назначения",
    4: "Промышленная зона",
    5: "Сельскохозяйственная зона",
    6: "Транспортная зона",
    7: "Общественно-деловая зона",
    10: "ИЖС",
    11: "Малоэтажная жилая зона",
    12: "Среднеэтажная жилая зона",
    13: "Многоэтажная жилая зона",
    14: "Неизвестная зона",
};

const FUNCTIONAL_ZONE_IDS_BY_VALUE: Record<string, number> = {
    residential: 1,
    "жилая": 1,
    recreation: 2,
    recreational: 2,
    "рекреационная": 2,
    special: 3,
    special_purpose: 3,
    "специального назначения": 3,
    industrial: 4,
    "промышленная": 4,
    agricultural: 5,
    agriculture: 5,
    "сельскохозяйственная": 5,
    transport: 6,
    "транспортная": 6,
    business: 7,
    public_business: 7,
    mixed_use: 7,
    "деловая": 7,
    individual_residential: 10,
    lowrise_residential: 11,
    midrise_residential: 12,
    highrise_residential: 13,
};

export function getFunctionalZoneId(value: unknown) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value !== "string" || !value.trim()) {
        return;
    }

    const normalizedValue = value.trim().toLowerCase();
    const numericZoneId = Number(normalizedValue);

    return Number.isFinite(numericZoneId)
        ? numericZoneId
        : FUNCTIONAL_ZONE_IDS_BY_VALUE[normalizedValue];
}

export function getFunctionalZoneColor(value: unknown) {
    const zoneId = getFunctionalZoneId(value);

    return zoneId === undefined
        ? FUNCTIONAL_ZONE_FALLBACK_COLOR
        : FUNCTIONAL_ZONE_COLORS_BY_ID[zoneId] ?? FUNCTIONAL_ZONE_FALLBACK_COLOR;
}

export function getFunctionalZoneName(value: unknown) {
    const zoneId = getFunctionalZoneId(value);
    return zoneId === undefined ? undefined : FUNCTIONAL_ZONE_NAMES_BY_ID[zoneId];
}
