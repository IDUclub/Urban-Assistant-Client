import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { MdClose } from "react-icons/md";
import CustomSelect, { type SelectOption } from "@components/ui/Select";
import DataStore, {
    type FunctionalZoneType,
    type ProjectScenario,
} from "@lib/DataStore";

interface CreateScenarioModalProps {
    projectId: number;
    projectName: string;
    baseScenarioId: number;
    onClose: () => void;
    onCreated: (scenario: ProjectScenario) => void | Promise<void>;
}

const EXCLUDED_FUNCTIONAL_ZONE_TYPE_IDS = new Set([8, 14, 15]);

function getScenarioErrorMessage(error: unknown) {
    if (!axios.isAxiosError(error)) {
        return "Не удалось создать сценарий. Попробуйте ещё раз.";
    }

    const detail = error.response?.data?.detail;

    if (typeof detail === "string" && detail.trim()) {
        return detail;
    }

    if (Array.isArray(detail)) {
        const messages = detail.flatMap((item) => (
            typeof item?.msg === "string" && item.msg.trim()
                ? [item.msg]
                : []
        ));

        if (messages.length) return messages.join(". ");
    }

    return "Не удалось создать сценарий. Проверьте данные и попробуйте ещё раз.";
}

function getZoneTypeLabel(zoneType: FunctionalZoneType) {
    return zoneType.description ?? zoneType.name;
}

function CreateScenarioModal({
    projectId,
    projectName,
    baseScenarioId,
    onClose,
    onCreated,
}: CreateScenarioModalProps) {
    const nameInputRef = useRef<HTMLInputElement | null>(null);
    const [name, setName] = useState("");
    const [functionalZoneTypeId, setFunctionalZoneTypeId] = useState<number | null>(null);
    const [functionalZoneTypes, setFunctionalZoneTypes] = useState<FunctionalZoneType[]>(
        () => DataStore.functionalZoneTypes ?? [],
    );
    const [isZoneTypesLoading, setIsZoneTypesLoading] = useState(
        DataStore.functionalZoneTypes === null,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);
    const zoneTypeOptions: SelectOption[] = functionalZoneTypes
        .filter((zoneType) => !EXCLUDED_FUNCTIONAL_ZONE_TYPE_IDS.has(zoneType.id))
        .map((zoneType) => ({
            label: getZoneTypeLabel(zoneType),
            value: zoneType.id,
        }));
    const canSubmit = !!name.trim()
        && functionalZoneTypeId !== null
        && !isZoneTypesLoading
        && !isSubmitting;

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        nameInputRef.current?.focus();

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isSubmitting) onClose();
        };

        document.addEventListener("keydown", handleEscape);

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isSubmitting, onClose]);

    useEffect(() => {
        let isActive = true;

        if (DataStore.functionalZoneTypes !== null) {
            setFunctionalZoneTypes(DataStore.functionalZoneTypes);
            setIsZoneTypesLoading(false);
            return () => {
                isActive = false;
            };
        }

        setIsZoneTypesLoading(true);
        setErrorText(null);

        void DataStore.getFunctionalZoneTypes()
            .then((zoneTypes) => {
                if (!isActive) return;
                setFunctionalZoneTypes(zoneTypes);
            })
            .catch((error) => {
                if (!isActive) return;
                console.error("Error fetching functional zone types:", error);
                setErrorText("Не удалось загрузить типы профиля.");
            })
            .finally(() => {
                if (isActive) setIsZoneTypesLoading(false);
            });

        return () => {
            isActive = false;
        };
    }, []);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canSubmit || functionalZoneTypeId === null) return;

        setIsSubmitting(true);
        setErrorText(null);

        try {
            const scenario = await DataStore.createProjectScenario(baseScenarioId, {
                project_id: projectId,
                functional_zone_type_id: functionalZoneTypeId,
                name: name.trim(),
                properties: {},
            });

            await onCreated(scenario);
            onClose();
        } catch (error) {
            console.error("Error creating project scenario:", error);
            setErrorText(getScenarioErrorMessage(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !isSubmitting) onClose();
            }}
        >
            <div
                className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-[0_30px_80px_-24px_var(--shadow-popover)] customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary"
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-scenario-title"
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h2 id="create-scenario-title" className="text-xl font-semibold">
                            Создать сценарий
                        </h2>
                        <p className="mt-1 truncate text-sm text-slate-500 customer-dark:text-content-muted" title={projectName}>
                            Проект: {projectName}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 customer:focus-visible:ring-brand-primary/40 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Закрыть окно создания сценария"
                    >
                        <MdClose size={22} />
                    </button>
                </div>

                <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                    <label className="block">
                        <span className="mb-2 block text-sm font-medium">
                            Название сценария
                        </span>
                        <input
                            ref={nameInputRef}
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Введите название"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[#0788CE] customer:focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:placeholder:text-content-muted"
                            disabled={isSubmitting}
                            required
                        />
                    </label>

                    <div>
                        <span className="mb-2 block text-sm font-medium">
                            Тип профиля
                        </span>
                        {isZoneTypesLoading ? (
                            <div className="flex min-h-11 items-center rounded-2xl border border-slate-200 px-4 text-sm text-slate-400 customer-dark:border-ui-border customer-dark:text-content-muted">
                                Загрузка типов профиля...
                            </div>
                        ) : zoneTypeOptions.length ? (
                            <CustomSelect
                                value={functionalZoneTypeId ?? undefined}
                                options={zoneTypeOptions}
                                onChange={(value) => setFunctionalZoneTypeId(Number(value))}
                                placeholder="Выберите тип профиля"
                                block
                                compactGlow
                            />
                        ) : (
                            <div className="flex min-h-11 items-center rounded-2xl border border-slate-200 px-4 text-sm text-slate-400 customer-dark:border-ui-border customer-dark:text-content-muted">
                                Типы профиля не найдены
                            </div>
                        )}
                    </div>

                    {errorText && (
                        <div
                            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 customer-dark:border-danger-border customer-dark:bg-danger-soft customer-dark:text-danger-content"
                            role="alert"
                        >
                            {errorText}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5 customer-dark:border-ui-border">
                        <button
                            type="button"
                            className="rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="rounded-2xl bg-[#0788CE] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0676B3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 customer:bg-brand-primary customer:hover:bg-brand-hover customer:focus-visible:ring-brand-primary/40 customer-dark:ring-offset-surface-raised"
                            disabled={!canSubmit}
                        >
                            {isSubmitting ? "Создание..." : "Создать"}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
}

export default CreateScenarioModal;
