import { useEffect, useMemo, useState } from "react";
import { IoAlertCircleOutline } from "react-icons/io5";
import { LuDownload, LuFile, LuMap } from "react-icons/lu";
import MapStore from "@lib/MapStore";
import SynapseClient, {
  type SynapseArchiveRef,
  type SynapseArtifact,
} from "@lib/synapse/client";

const GEOJSON_TYPES = new Set([
  "Feature",
  "FeatureCollection",
  "GeometryCollection",
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);

function fileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || "artifact";
}

function looksLikeGeoJson(artifact: SynapseArtifact) {
  const path = artifact.path.toLowerCase();
  const contentType = artifact.content_type?.toLowerCase() ?? "";
  return path.endsWith(".geojson") || contentType.includes("geo+json");
}

function parseGeoJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return;
  }

  try {
    if (typeof value === "string") {
      return parseGeoJsonValue(JSON.parse(value), depth + 1);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }

    const type = (value as { type?: unknown }).type;
    if (typeof type === "string" && GEOJSON_TYPES.has(type)) {
      return value;
    }

    const record = value as Record<string, unknown>;
    return parseGeoJsonValue(record.text ?? record.result, depth + 1);
  } catch {
    return;
  }
}

function parseGeoJson(artifact: SynapseArtifact) {
  return typeof artifact.content === "string" && artifact.content.trim()
    ? parseGeoJsonValue(artifact.content)
    : undefined;
}

function archiveMayContainGeoJson(archiveRef: SynapseArchiveRef) {
  const path = archiveRef.path?.toLowerCase() ?? "";
  const contentType = archiveRef.content_type?.toLowerCase() ?? "";
  const preview = (archiveRef.preview ?? "").replaceAll('\\"', '"');
  return (
    path.endsWith(".geojson") ||
    contentType.includes("geo+json") ||
    /"type"\s*:\s*"(?:Feature|FeatureCollection|GeometryCollection|Point|MultiPoint|LineString|MultiLineString|Polygon|MultiPolygon)"/.test(
      preview,
    )
  );
}

function artifactKey(artifact: SynapseArtifact) {
  return (
    artifact.archive_ref_id ||
    `${artifact.run_id ?? "project"}:${artifact.path}:${artifact.version ?? 0}`
  );
}

function archiveName(archiveRef: SynapseArchiveRef) {
  const name = fileName(
    archiveRef.path || archiveRef.tool_id || archiveRef.ref_id,
  );
  if (name.includes(".")) {
    return name;
  }

  return archiveRef.content_type?.toLowerCase().includes("json")
    ? `${name}.json`
    : name;
}

function artifactMimeType(artifact: SynapseArtifact, isGeoJson: boolean) {
  if (isGeoJson) {
    return "application/geo+json";
  }

  return artifact.content_type || "text/plain;charset=utf-8";
}

function downloadBlob(artifact: SynapseArtifact, isGeoJson: boolean) {
  const content = artifact.content;
  if (typeof content !== "string") {
    throw new Error("Содержимое файла недоступно.");
  }

  const blob = new Blob([content], {
    type: artifactMimeType(artifact, isGeoJson),
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName(artifact.path);
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatSize(value?: number | null) {
  if (!value || value < 1) return;
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
}

export default function MasBfmArtifacts({
  artifacts,
  archiveRefs,
  projectId,
}: {
  artifacts: SynapseArtifact[];
  archiveRefs: SynapseArchiveRef[];
  projectId?: string;
}) {
  const [error, setError] = useState<string>();
  const [archivedContents, setArchivedContents] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const controller = new AbortController();
    const spilledGeoJson = artifacts.filter(
      (artifact) =>
        artifact.spilled &&
        artifact.archive_ref_id &&
        looksLikeGeoJson(artifact),
    );
    const largeGeoJson = archiveRefs.filter(archiveMayContainGeoJson);
    const archiveRefIds = Array.from(
      new Set([
        ...spilledGeoJson.map(
          (artifact) => artifact.archive_ref_id as string,
        ),
        ...largeGeoJson.map((archiveRef) => archiveRef.ref_id),
      ]),
    );
    setArchivedContents({});
    setError(undefined);
    if (!projectId || !archiveRefIds.length) {
      return () => controller.abort();
    }

    void Promise.allSettled(
      archiveRefIds.map(async (refId) => {
        const content = await SynapseClient.getArchiveContent(
          projectId,
          refId,
          controller.signal,
        );
        return [refId, content] as const;
      }),
    ).then((results) => {
      if (controller.signal.aborted) {
        return;
      }

      const loaded = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      setArchivedContents(Object.fromEntries(loaded));
      if (results.some((result) => result.status === "rejected")) {
        setError("Не удалось загрузить один из GeoJSON-файлов на карту.");
      }
    });

    return () => controller.abort();
  }, [archiveRefs, artifacts, projectId]);

  const items = useMemo(
    () =>
      [
        ...artifacts,
        ...archiveRefs
          .filter(
            (archiveRef) =>
              !artifacts.some(
                (artifact) => artifact.archive_ref_id === archiveRef.ref_id,
              ),
          )
          .map(
            (archiveRef): SynapseArtifact => ({
              path: archiveName(archiveRef),
              content: archivedContents[archiveRef.ref_id],
              run_id: archiveRef.run_id,
              spilled: true,
              archive_ref_id: archiveRef.ref_id,
              size_bytes: archiveRef.size_bytes,
              content_type: archiveRef.content_type,
            }),
          ),
      ].map((artifact) => {
        const content = artifact.archive_ref_id
          ? (archivedContents[artifact.archive_ref_id] ?? artifact.content)
          : artifact.content;
        const artifactWithContent = { ...artifact, content };
        const geoJson = parseGeoJson(artifactWithContent);
        return {
          artifact,
          geoJson,
          isGeoJson: looksLikeGeoJson(artifact) || !!geoJson,
        };
      }),
    [archiveRefs, archivedContents, artifacts],
  );
  const mapLayers = useMemo(
    () =>
      items.flatMap(({ artifact, geoJson }) =>
        geoJson ? [{ name: fileName(artifact.path), layer: geoJson }] : [],
      ),
    [items],
  );

  useEffect(() => {
    MapStore.setMapLayers(mapLayers);
  }, [mapLayers]);

  if (!items.length) {
    return null;
  }

  const download = async (artifact: SynapseArtifact, isGeoJson: boolean) => {
    setError(undefined);
    try {
      if (artifact.spilled && artifact.archive_ref_id) {
        if (!projectId) {
          throw new Error("Проект Synapse не найден.");
        }
        const { url } = await SynapseClient.getArchiveDownloadUrl(
          projectId,
          artifact.archive_ref_id,
        );
        if (!url) {
          throw new Error("Synapse не вернул ссылку на файл.");
        }
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
          throw new Error("Synapse вернул некорректную ссылку на файл.");
        }
        const anchor = document.createElement("a");
        anchor.href = parsedUrl.toString();
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
        return;
      }
      downloadBlob(artifact, isGeoJson);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Не удалось скачать файл.",
      );
    }
  };

  return (
    <section aria-label="Артефакты Synapse" className="mt-2">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-content-muted">
        Артефакты
      </h2>
      <div className="flex flex-col gap-2">
        {items.map(({ artifact, geoJson, isGeoJson }) => {
          const name = fileName(artifact.path);
          const size = formatSize(artifact.size_bytes);
          const canDownload =
            typeof artifact.content === "string" ||
            (!!artifact.spilled && !!artifact.archive_ref_id);

          return (
            <div
              key={artifactKey(artifact)}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-ui-border bg-surface-raised px-4 py-3 text-sm text-content-primary"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-primary">
                {isGeoJson ? <LuMap size={18} /> : <LuFile size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" title={artifact.path}>
                  {name}
                </div>
                <div className="mt-0.5 text-xs text-content-muted">
                  {isGeoJson
                    ? geoJson
                      ? "GeoJSON · показан на карте"
                      : "GeoJSON"
                    : "Файл"}
                  {size ? ` · ${size}` : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={!canDownload}
                onClick={() => void download(artifact, isGeoJson)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-brand-primary transition-colors hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                <LuDownload size={16} />
                Скачать
              </button>
            </div>
          );
        })}
      </div>
      {error && (
        <div className="mt-2 flex items-center gap-2 px-2 text-xs text-red-600 customer-dark:text-red-300">
          <IoAlertCircleOutline size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
