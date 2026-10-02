import type { IconType } from "react-icons";
import {
  IoAlertCircleOutline,
  IoCheckmarkCircleOutline,
  IoTimeOutline,
} from "react-icons/io5";

type ProjectStatusConfig = {
  label: string;
  Icon: IconType;
  className: string;
  iconClassName?: string;
};

const PROJECT_STATUS_CONFIG: Record<string, ProjectStatusConfig> = {
  completed: {
    label: "Завершено",
    Icon: IoCheckmarkCircleOutline,
    className: "text-emerald-600 customer-dark:text-emerald-300",
  },
  failed: {
    label: "Ошибка выполнения",
    Icon: IoAlertCircleOutline,
    className: "text-red-600 customer-dark:text-red-300",
  },
  cancelled: {
    label: "Остановлено",
    Icon: IoTimeOutline,
    className: "text-content-muted",
  },
  waiting_approval_timeout: {
    label: "Ожидает подтверждения",
    Icon: IoTimeOutline,
    className: "text-content-muted",
  },
};

const DEFAULT_PROJECT_STATUS_CONFIG: ProjectStatusConfig = {
  label: "Выполняется",
  Icon: IoTimeOutline,
  className: "text-content-muted",
  iconClassName: "animate-pulse",
};

export default function MasBfmProjectStatus({ status }: { status?: string }) {
  if (!status) {
    return null;
  }

  const normalizedStatus = status.trim().toLowerCase();
  const { label, Icon, className, iconClassName } = Object.hasOwn(
    PROJECT_STATUS_CONFIG,
    normalizedStatus,
  )
    ? PROJECT_STATUS_CONFIG[normalizedStatus]
    : DEFAULT_PROJECT_STATUS_CONFIG;

  return (
    <div
      role="status"
      className={`flex items-center gap-1.5 text-xs font-medium ${className}`}
    >
      <Icon size={15} aria-hidden="true" className={iconClassName} />
      <span>{label}</span>
    </div>
  );
}
