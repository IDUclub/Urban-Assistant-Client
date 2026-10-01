import { MdCheck, MdClose } from "react-icons/md";
import type { MatrixCellValue } from "@lib/genplanner/zoneAdjacencyMatrix";

type ZoneAdjacencyMatrixCellProps = {
    value: MatrixCellValue;
    rowZoneLabel: string;
    columnZoneLabel: string;
    disabled?: boolean;
    onChange: (value: MatrixCellValue) => void;
};

function getNextValue(value: MatrixCellValue): MatrixCellValue {
    if (value === null) {
        return "allow";
    }

    if (value === "allow") {
        return "deny";
    }

    return null;
}

function getValueDescription(value: MatrixCellValue) {
    if (value === "allow") {
        return "соседство обязательно";
    }

    if (value === "deny") {
        return "соседство запрещено";
    }

    return "ограничение не задано";
}

export default function ZoneAdjacencyMatrixCell({
    value,
    rowZoneLabel,
    columnZoneLabel,
    disabled = false,
    onChange,
}: ZoneAdjacencyMatrixCellProps) {
    const valueDescription = disabled
        ? "недоступно для выбора"
        : getValueDescription(value);

    const className = [
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
        disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
            : "cursor-pointer",
        !disabled && value === null
            ? "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
            : "",
        !disabled && value === "allow"
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "",
        !disabled && value === "deny"
            ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
            : "",
    ].join(" ");

    return (
        <button
            type="button"
            className={className}
            disabled={disabled}
            title={valueDescription}
            aria-label={`${rowZoneLabel} и ${columnZoneLabel}: ${valueDescription}`}
            onClick={() => onChange(getNextValue(value))}
        >
            {value === "allow" && <MdCheck size={18} aria-hidden="true" />}
            {value === "deny" && <MdClose size={18} aria-hidden="true" />}
        </button>
    );
}