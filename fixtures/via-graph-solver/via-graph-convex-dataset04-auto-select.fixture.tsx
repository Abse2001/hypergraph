import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import type { XYConnection } from "lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { ViaGraphSolver } from "lib/ViaGraphSolver/ViaGraphSolver"
import {
  createConvexViaGraphFromXYConnections,
  recommendViaTileFromGraphInput,
} from "lib/ViaGraphSolver/via-graph-generator/createConvexViaGraphFromXYConnections"
import { hgProblems } from "high-density-dataset-z04"
import { useMemo, useState } from "react"

type PortPoint = {
  x: number
  y: number
  z?: number
  connectionName: string
  rootConnectionName?: string
}

type NodeWithPortPoints = {
  capacityMeshNodeId?: string
  center: { x: number; y: number }
  width: number
  height: number
  portPoints: PortPoint[]
}

type Dataset04Entry = {
  id: string | number
  data: NodeWithPortPoints
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const isNodeWithPortPoints = (value: unknown): value is NodeWithPortPoints => {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>

  if (
    !candidate.center ||
    typeof candidate.center !== "object" ||
    !isFiniteNumber((candidate.center as Record<string, unknown>).x) ||
    !isFiniteNumber((candidate.center as Record<string, unknown>).y)
  ) {
    return false
  }

  if (!isFiniteNumber(candidate.width) || !isFiniteNumber(candidate.height)) {
    return false
  }

  return Array.isArray(candidate.portPoints)
}

const normalizeDataset04Entries = (
  rawProblems: readonly unknown[],
): Dataset04Entry[] => {
  const normalized: Dataset04Entry[] = []

  for (let i = 0; i < rawProblems.length; i++) {
    const candidate = rawProblems[i]
    if (!candidate || typeof candidate !== "object") continue

    const asRecord = candidate as Record<string, unknown>
    if (isNodeWithPortPoints(candidate)) {
      normalized.push({ id: i + 1, data: candidate })
      continue
    }

    if (!isNodeWithPortPoints(asRecord.data)) continue

    normalized.push({
      id:
        typeof asRecord.id === "number" || typeof asRecord.id === "string"
          ? asRecord.id
          : i + 1,
      data: asRecord.data,
    })
  }

  return normalized
}

const dedupePoints = (points: PortPoint[]): Array<{ x: number; y: number }> => {
  const seen = new Set<string>()
  const deduped: Array<{ x: number; y: number }> = []

  for (const point of points) {
    if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) continue
    const key = `${point.x.toFixed(6)}:${point.y.toFixed(6)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({ x: point.x, y: point.y })
  }

  return deduped
}

const pickFarthestPair = (
  points: Array<{ x: number; y: number }>,
): [{ x: number; y: number }, { x: number; y: number }] => {
  let bestA = points[0]!
  let bestB = points[1]!
  let bestDistSq = -1

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i]!.x - points[j]!.x
      const dy = points[i]!.y - points[j]!.y
      const distSq = dx * dx + dy * dy

      if (distSq > bestDistSq) {
        bestDistSq = distSq
        bestA = points[i]!
        bestB = points[j]!
      }
    }
  }

  return [bestA, bestB]
}

const extractXYConnectionsFromNode = (node: NodeWithPortPoints) => {
  const groups = new Map<string, PortPoint[]>()

  for (const point of node.portPoints) {
    const connectionId = point.rootConnectionName ?? point.connectionName
    if (!connectionId) continue

    const bucket = groups.get(connectionId) ?? []
    bucket.push(point)
    groups.set(connectionId, bucket)
  }

  const xyConnections: XYConnection[] = []
  let skippedSinglePointConnections = 0
  let truncatedMultiPointConnections = 0

  for (const [connectionId, points] of groups.entries()) {
    const deduped = dedupePoints(points)
    if (deduped.length < 2) {
      skippedSinglePointConnections += 1
      continue
    }

    const [start, end] =
      deduped.length === 2
        ? [deduped[0]!, deduped[1]!]
        : pickFarthestPair(deduped)

    if (deduped.length > 2) {
      truncatedMultiPointConnections += 1
    }

    xyConnections.push({
      connectionId,
      start,
      end,
    })
  }

  return {
    xyConnections,
    skippedSinglePointConnections,
    truncatedMultiPointConnections,
  }
}

const typedDataset = normalizeDataset04Entries(
  hgProblems as unknown as readonly unknown[],
)

export default () => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [key, setKey] = useState(0)

  const entry = typedDataset[selectedIndex]

  const problem = useMemo(() => {
    if (!entry) return null

    const extracted = extractXYConnectionsFromNode(entry.data)
    if (extracted.xyConnections.length === 0) {
      return {
        graph: null,
        connections: [],
        tileCount: { rows: 0, cols: 0 },
        viaTile: null,
        selectedViaRegionName: null,
        skippedSinglePointConnections: extracted.skippedSinglePointConnections,
        truncatedMultiPointConnections:
          extracted.truncatedMultiPointConnections,
        connectionCount: 0,
      }
    }

    const problemInput = {
      graphWidthMm: entry.data.width,
      graphHeightMm: entry.data.height,
      connectionCount: extracted.xyConnections.length,
      xyConnections: extracted.xyConnections,
    }
    const recommendation = recommendViaTileFromGraphInput(
      problemInput,
      extracted.xyConnections,
    )
    const result = createConvexViaGraphFromXYConnections(
      extracted.xyConnections,
      problemInput,
    )

    return {
      graph: result,
      connections: result.connections,
      tileCount: result.tileCount,
      viaTile: result.viaTile,
      selectedViaRegionName: recommendation.recommendedViaRegionName,
      skippedSinglePointConnections: extracted.skippedSinglePointConnections,
      truncatedMultiPointConnections: extracted.truncatedMultiPointConnections,
      connectionCount: extracted.xyConnections.length,
    }
  }, [entry])

  if (!entry || !problem) {
    return (
      <div style={{ padding: 20, fontFamily: "monospace" }}>
        No dataset loaded. Ensure `high-density-dataset-z04` is available.
      </div>
    )
  }

  const convexRegions =
    problem.graph?.regions.filter(
      (r) =>
        r.regionId.includes(":convex:") || r.regionId.startsWith("filler:"),
    ).length ?? 0
  const viaRegions =
    problem.graph?.regions.filter((r) => r.d.isViaRegion).length ?? 0

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          padding: "10px 20px",
          borderBottom: "1px solid #ccc",
          background: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <label>
            Sample:{" "}
            <input
              type="number"
              min={0}
              max={typedDataset.length - 1}
              value={selectedIndex}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10)
                if (
                  !Number.isNaN(value) &&
                  value >= 0 &&
                  value < typedDataset.length
                ) {
                  setSelectedIndex(value)
                  setKey((current) => current + 1)
                }
              }}
              style={{ width: 80, marginRight: 5 }}
            />
            / {typedDataset.length - 1}
          </label>
          <button
            onClick={() => {
              setSelectedIndex(Math.max(0, selectedIndex - 1))
              setKey((current) => current + 1)
            }}
            disabled={selectedIndex === 0}
          >
            Prev
          </button>
          <button
            onClick={() => {
              setSelectedIndex(
                Math.min(typedDataset.length - 1, selectedIndex + 1),
              )
              setKey((current) => current + 1)
            }}
            disabled={selectedIndex === typedDataset.length - 1}
          >
            Next
          </button>
          <button
            onClick={() => {
              setSelectedIndex(Math.floor(Math.random() * typedDataset.length))
              setKey((current) => current + 1)
            }}
          >
            Random
          </button>
        </div>
        <div
          style={{ marginTop: 8, display: "flex", gap: 20, flexWrap: "wrap" }}
        >
          <span>
            <strong>Problem:</strong> {String(entry.id)}
          </span>
          <span>
            <strong>Node:</strong> {entry.data.width.toFixed(2)}mm x{" "}
            {entry.data.height.toFixed(2)}mm
          </span>
          <span>
            <strong>Connections:</strong> {problem.connectionCount}
          </span>
          <span>
            <strong>Skipped singles:</strong>{" "}
            {problem.skippedSinglePointConnections}
          </span>
          <span>
            <strong>Truncated multi-point:</strong>{" "}
            {problem.truncatedMultiPointConnections}
          </span>
          <span>
            <strong>Selected via:</strong>{" "}
            {problem.selectedViaRegionName ?? "N/A"}
          </span>
          <span>
            <strong>Tiles:</strong> {problem.tileCount.cols}x
            {problem.tileCount.rows}
          </span>
          <span>
            <strong>Convex regions:</strong> {convexRegions}
          </span>
          <span>
            <strong>Via regions:</strong> {viaRegions}
          </span>
        </div>
      </div>

      {problem.graph && problem.viaTile ? (
        <div style={{ flex: 1 }}>
          <GenericSolverDebugger
            key={key}
            createSolver={() =>
              new ViaGraphSolver({
                inputGraph: {
                  regions: problem.graph!.regions,
                  ports: problem.graph!.ports,
                },
                inputConnections: problem.connections,
                viaTile: problem.viaTile!,
              })
            }
          />
        </div>
      ) : (
        <div style={{ padding: 20, fontFamily: "monospace" }}>
          No usable XY connections for this sample.
        </div>
      )}
    </div>
  )
}
