import type { XYConnection } from "../lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { ViaGraphSolver } from "../lib/ViaGraphSolver/ViaGraphSolver"
import { createConvexViaGraphFromXYConnections } from "../lib/ViaGraphSolver/via-graph-generator/createConvexViaGraphFromXYConnections"
import { hgProblems } from "high-density-dataset-z04"

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

type BenchmarkResult = {
  sampleIndex: number
  problemId: string
  solved: boolean
  failed: boolean
  skipped: boolean
  iterations: number
  duration: number
  tileRows: number
  tileCols: number
  convexRegions: number
  viaRegions: number
  connectionCount: number
  skippedSinglePointConnections: number
  truncatedMultiPointConnections: number
  error?: string
}

const args = process.argv.slice(2)
const limitArg = args.find((a) => a.startsWith("--limit="))
const offsetArg = args.find((a) => a.startsWith("--offset="))
const SAMPLE_LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined
const OFFSET = offsetArg ? parseInt(offsetArg.split("=")[1], 10) : 0
const QUICK_MODE = args.includes("--quick")
const HELP = args.includes("--help") || args.includes("-h")

if (HELP) {
  console.log(`
Usage: bun run scripts/benchmark-via-graph-dataset04.ts [options]

Options:
  --limit=N    Only run first N samples after offset (default: all)
  --offset=N   Skip first N samples (default: 0)
  --quick      Use reduced MAX_ITERATIONS for faster but less accurate results
  --help, -h   Show this help message

Examples:
  bun run scripts/benchmark-via-graph-dataset04.ts --limit=100
  bun run scripts/benchmark-via-graph-dataset04.ts --offset=500 --limit=100
  bun run scripts/benchmark-via-graph-dataset04.ts --quick --limit=200
`)
  process.exit(0)
}

if (!Number.isInteger(OFFSET) || OFFSET < 0) {
  console.error("Error: --offset must be a non-negative integer")
  process.exit(1)
}

if (
  SAMPLE_LIMIT !== undefined &&
  (!Number.isInteger(SAMPLE_LIMIT) || SAMPLE_LIMIT < 0)
) {
  console.error("Error: --limit must be a non-negative integer")
  process.exit(1)
}

const mean = (numbers: number[]): number | undefined => {
  if (numbers.length === 0) return undefined
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
}

const median = (numbers: number[]): number | undefined => {
  if (numbers.length === 0) return undefined
  const sorted = numbers.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted[middle]
}

const percentile = (numbers: number[], p: number): number | undefined => {
  if (numbers.length === 0) return undefined
  const sorted = numbers.slice().sort((a, b) => a - b)
  const index = Math.floor((p / 100) * (sorted.length - 1))
  return sorted[index]
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const isNodeWithPortPoints = (value: unknown): value is NodeWithPortPoints => {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (
    !v.center ||
    typeof v.center !== "object" ||
    !isFiniteNumber((v.center as Record<string, unknown>).x) ||
    !isFiniteNumber((v.center as Record<string, unknown>).y)
  ) {
    return false
  }
  if (!isFiniteNumber(v.width) || !isFiniteNumber(v.height)) return false
  return Array.isArray(v.portPoints)
}

const normalizeDataset04Entries = (
  rawProblems: unknown[],
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

    if (isNodeWithPortPoints(asRecord.data)) {
      normalized.push({
        id:
          typeof asRecord.id === "number" || typeof asRecord.id === "string"
            ? asRecord.id
            : i + 1,
        data: asRecord.data,
      })
    }
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

const tryToSolve = (
  entry: Dataset04Entry,
  quickMode: boolean,
): Omit<BenchmarkResult, "sampleIndex"> => {
  const extracted = extractXYConnectionsFromNode(entry.data)

  if (extracted.xyConnections.length === 0) {
    return {
      problemId: String(entry.id),
      solved: false,
      failed: false,
      skipped: true,
      iterations: 0,
      duration: 0,
      tileRows: 0,
      tileCols: 0,
      convexRegions: 0,
      viaRegions: 0,
      connectionCount: 0,
      skippedSinglePointConnections: extracted.skippedSinglePointConnections,
      truncatedMultiPointConnections: extracted.truncatedMultiPointConnections,
      error: "No usable XY connections in problem",
    }
  }

  try {
    const graph = createConvexViaGraphFromXYConnections(extracted.xyConnections)
    const convexRegions = graph.regions.filter((r) =>
      r.regionId.startsWith("convex:"),
    ).length
    const viaRegions = graph.regions.filter((r) => r.d.isViaRegion).length

    const solverOpts: ConstructorParameters<typeof ViaGraphSolver>[0] = {
      inputGraph: {
        regions: graph.regions,
        ports: graph.ports,
      },
      inputConnections: graph.connections,
      viaTile: graph.viaTile,
    }

    if (quickMode) {
      solverOpts.baseMaxIterations = 50000
    }

    const solver = new ViaGraphSolver(solverOpts)
    const startTime = performance.now()
    solver.solve()
    const duration = performance.now() - startTime

    return {
      problemId: String(entry.id),
      solved: solver.solved,
      failed: solver.failed,
      skipped: false,
      iterations: solver.iterations,
      duration,
      tileRows: graph.tileCount.rows,
      tileCols: graph.tileCount.cols,
      convexRegions,
      viaRegions,
      connectionCount: extracted.xyConnections.length,
      skippedSinglePointConnections: extracted.skippedSinglePointConnections,
      truncatedMultiPointConnections: extracted.truncatedMultiPointConnections,
    }
  } catch (error) {
    return {
      problemId: String(entry.id),
      solved: false,
      failed: true,
      skipped: false,
      iterations: 0,
      duration: 0,
      tileRows: 0,
      tileCols: 0,
      convexRegions: 0,
      viaRegions: 0,
      connectionCount: extracted.xyConnections.length,
      skippedSinglePointConnections: extracted.skippedSinglePointConnections,
      truncatedMultiPointConnections: extracted.truncatedMultiPointConnections,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const rawProblems = hgProblems as unknown as unknown[]
const parsedDataset = normalizeDataset04Entries(rawProblems)
const offsetDataset = parsedDataset.slice(OFFSET)
const samplesToRun =
  SAMPLE_LIMIT !== undefined
    ? offsetDataset.slice(0, SAMPLE_LIMIT)
    : offsetDataset
const totalSamples = samplesToRun.length

console.log("Benchmark: ViaGraphSolver with Dataset04")
console.log("=".repeat(70))
console.log(`Loaded ${parsedDataset.length} samples from dataset04`)
if (OFFSET > 0) {
  console.log(`Offset: ${OFFSET}`)
}
if (SAMPLE_LIMIT) {
  console.log(`Sample limit: ${SAMPLE_LIMIT}`)
}
if (QUICK_MODE) {
  console.log("Quick mode: enabled (reduced MAX_ITERATIONS)")
}
console.log()

if (samplesToRun.length === 0) {
  console.log("No samples selected.")
  process.exit(0)
}

const results: BenchmarkResult[] = []
const startTime = Date.now()
let lastProgressTime = Date.now()

const printProgress = () => {
  const now = Date.now()
  const completed = results.length
  if (now - lastProgressTime >= 1000 || completed === totalSamples) {
    const attempted = results.filter((r) => !r.skipped)
    const solvedCount = attempted.filter((r) => r.solved).length
    const failedCount = attempted.filter((r) => r.failed && !r.solved).length
    const elapsed = ((now - startTime) / 1000).toFixed(1)
    const rate =
      attempted.length > 0
        ? ((solvedCount / attempted.length) * 100).toFixed(1)
        : "0.0"
    const samplesPerSec = (completed / ((now - startTime) / 1000)).toFixed(1)
    console.log(
      `[${elapsed}s] ${completed}/${totalSamples} (${samplesPerSec}/s) | ` +
        `Solved: ${solvedCount} | Failed: ${failedCount} | Rate: ${rate}%`,
    )
    lastProgressTime = now
  }
}

for (let i = 0; i < samplesToRun.length; i++) {
  const result = tryToSolve(samplesToRun[i]!, QUICK_MODE)
  results.push({
    sampleIndex: i,
    ...result,
  })
  printProgress()
}

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1)
console.log(`\nCompleted in ${totalElapsed}s\n`)

const solvedResults = results.filter((r) => r.solved)
const failedResults = results.filter((r) => r.failed && !r.solved)
const unsolved = results.filter((r) => !r.solved)
const successRate =
  results.length > 0 ? (solvedResults.length / results.length) * 100 : 0

console.log("=".repeat(70))
console.log("Overall Results")
console.log("=".repeat(70))
console.log(`Total samples:  ${results.length}`)
console.log(
  `Solved:         ${solvedResults.length} (${successRate.toFixed(1)}%)`,
)
console.log(
  `Failed:         ${failedResults.length} (${results.length > 0 ? ((failedResults.length / results.length) * 100).toFixed(1) : "0.0"}%)`,
)
console.log(
  `Unsolved:       ${unsolved.length} (${results.length > 0 ? ((unsolved.length / results.length) * 100).toFixed(1) : "0.0"}%)`,
)

const avgConvexRegions = mean(solvedResults.map((r) => r.convexRegions))
const avgViaRegions = mean(solvedResults.map((r) => r.viaRegions))
console.log(`\nAvg convex regions: ${avgConvexRegions?.toFixed(1) ?? "N/A"}`)
console.log(`Avg via regions:    ${avgViaRegions?.toFixed(1) ?? "N/A"}`)

const solvedIterations = solvedResults.map((r) => r.iterations)
const solvedDurations = solvedResults.map((r) => r.duration)

console.log("\n" + "=".repeat(70))
console.log("Performance Statistics (Solved Samples)")
console.log("=".repeat(70))
console.log(
  `Iterations - Mean: ${mean(solvedIterations)?.toFixed(0) ?? "N/A"}, ` +
    `Median: ${median(solvedIterations)?.toFixed(0) ?? "N/A"}, ` +
    `P90: ${percentile(solvedIterations, 90)?.toFixed(0) ?? "N/A"}, ` +
    `P99: ${percentile(solvedIterations, 99)?.toFixed(0) ?? "N/A"}`,
)
console.log(
  `Duration (ms) - Mean: ${mean(solvedDurations)?.toFixed(1) ?? "N/A"}, ` +
    `Median: ${median(solvedDurations)?.toFixed(1) ?? "N/A"}, ` +
    `P90: ${percentile(solvedDurations, 90)?.toFixed(1) ?? "N/A"}, ` +
    `P99: ${percentile(solvedDurations, 99)?.toFixed(1) ?? "N/A"}`,
)

const tileCounts = solvedResults.map((r) => `${r.tileCols}x${r.tileRows}`)
const tileCountMap = new Map<string, number>()
for (const tile of tileCounts) {
  tileCountMap.set(tile, (tileCountMap.get(tile) || 0) + 1)
}
console.log("\nTile grid distribution (solved):")
const sortedTiles = Array.from(tileCountMap.entries()).sort((a, b) => {
  const [aCols, aRows] = a[0].split("x").map(Number)
  const [bCols, bRows] = b[0].split("x").map(Number)
  return aCols * aRows - bCols * bRows
})
for (const [tile, count] of sortedTiles) {
  const pct = ((count / solvedResults.length) * 100).toFixed(1)
  console.log(`  ${tile}: ${count} (${pct}%)`)
}

if (unsolved.length > 0 && unsolved.length <= 30) {
  console.log("\n" + "=".repeat(70))
  console.log("Unsolved Samples")
  console.log("=".repeat(70))
  for (const result of unsolved) {
    console.log(
      `  Problem ${result.problemId}: connections=${result.connectionCount}${result.error ? ` (error: ${result.error})` : ""}`,
    )
  }
} else if (unsolved.length > 30) {
  console.log(`\n${unsolved.length} samples unsolved (showing first 30):`)
  for (const result of unsolved.slice(0, 30)) {
    console.log(
      `  Problem ${result.problemId}: connections=${result.connectionCount}${result.error ? ` (error: ${result.error})` : ""}`,
    )
  }
}

console.log("\n" + "=".repeat(70))
console.log("Benchmark Complete")
console.log("=".repeat(70))
