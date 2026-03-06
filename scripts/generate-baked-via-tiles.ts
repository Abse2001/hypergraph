#!/usr/bin/env bun

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSvgFromGraphicsObject } from "graphics-debug"
import type { JRegion } from "../lib/JumperGraphSolver/jumper-types"
import { visualizeJumperGraph } from "../lib/JumperGraphSolver/visualizeJumperGraph"
import type { ViaTile } from "../lib/ViaGraphSolver/ViaGraphSolver"
import { generateConvexViaTopologyRegions } from "../lib/ViaGraphSolver/via-graph-generator/generateConvexViaTopologyRegions"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = path.join(SCRIPT_DIR, "..", "assets", "ViaGraphSolver")
const DEFAULT_INPUT_FILES = [
  "via-tile-3-regions.json",
  "via-tile-4-regions.json",
  "via-tile-5-regions.json",
  "via-tile-6-regions.json",
]
const NET_COLOR_PALETTE = [
  "rgba(231, 76, 60, 0.35)",
  "rgba(46, 204, 113, 0.35)",
  "rgba(52, 152, 219, 0.35)",
  "rgba(243, 156, 18, 0.35)",
  "rgba(155, 89, 182, 0.35)",
  "rgba(26, 188, 156, 0.35)",
  "rgba(241, 196, 15, 0.35)",
  "rgba(230, 126, 34, 0.35)",
]

type Point = { x: number; y: number }
type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

type BakedViaTileRegion = {
  regionId: string
  polygon: Point[]
  bounds: Bounds
  center: Point
  isViaRegion: boolean
  netName?: string
}

type BakedViaTile = ViaTile & {
  regions: BakedViaTileRegion[]
}

const parseViaNetName = (regionId: string): string | undefined => {
  const marker = ":v:"
  const markerIndex = regionId.lastIndexOf(marker)
  if (markerIndex === -1) return undefined
  return regionId.slice(markerIndex + marker.length)
}

const serializeRegion = (region: JRegion): BakedViaTileRegion => ({
  regionId: region.regionId,
  polygon: region.d.polygon ?? [],
  bounds: {
    minX: region.d.bounds.minX,
    maxX: region.d.bounds.maxX,
    minY: region.d.bounds.minY,
    maxY: region.d.bounds.maxY,
  },
  center: { x: region.d.center.x, y: region.d.center.y },
  isViaRegion: Boolean(region.d.isViaRegion),
  netName: parseViaNetName(region.regionId),
})

function bakeViaTile(
  viaTile: ViaTile,
  opts?: {
    tileWidth?: number
    tileHeight?: number
    portPitch?: number
    clearance?: number
    concavityTolerance?: number
  },
): BakedViaTile {
  const tileWidth = opts?.tileWidth ?? viaTile.tileWidth
  const tileHeight = opts?.tileHeight ?? viaTile.tileHeight

  if (tileWidth === undefined || tileHeight === undefined) {
    throw new Error(
      "Cannot bake via tile without tileWidth and tileHeight (in input or opts).",
    )
  }

  const singleTileBounds = {
    minX: -tileWidth / 2,
    maxX: tileWidth / 2,
    minY: -tileHeight / 2,
    maxY: tileHeight / 2,
  }

  const singleTile = generateConvexViaTopologyRegions({
    viaTile,
    bounds: singleTileBounds,
    tileWidth,
    tileHeight,
    portPitch: opts?.portPitch,
    clearance: opts?.clearance,
    concavityTolerance: opts?.concavityTolerance,
  })

  const insideRegions = singleTile.regions.filter(
    (region) => !region.regionId.startsWith("filler:"),
  )

  return {
    ...viaTile,
    tileWidth,
    tileHeight,
    regions: insideRegions.map(serializeRegion),
  }
}

function buildBakedViaTileSvg(bakedViaTile: BakedViaTile): string {
  const tileWidth = bakedViaTile.tileWidth
  const tileHeight = bakedViaTile.tileHeight
  if (tileWidth === undefined || tileHeight === undefined) {
    throw new Error(
      "Cannot render baked via tile SVG without tileWidth and tileHeight.",
    )
  }

  const singleTileBounds = {
    minX: -tileWidth / 2,
    maxX: tileWidth / 2,
    minY: -tileHeight / 2,
    maxY: tileHeight / 2,
  }

  const singleTile = generateConvexViaTopologyRegions({
    viaTile: bakedViaTile,
    bounds: singleTileBounds,
    tileWidth,
    tileHeight,
  })
  const regions = singleTile.regions.filter(
    (region) => !region.regionId.startsWith("filler:"),
  )
  const insideRegionIds = new Set(regions.map((region) => region.regionId))
  const ports = singleTile.ports.filter(
    (port) =>
      insideRegionIds.has(port.region1.regionId) &&
      insideRegionIds.has(port.region2.regionId),
  )

  const graphics = visualizeJumperGraph(
    { regions, ports },
    {
      hideRegionPortLines: true,
      hideConnectionLines: true,
      hidePortPoints: false,
    },
  ) as Required<ReturnType<typeof visualizeJumperGraph>>

  for (const polygon of graphics.polygons) {
    polygon.stroke = "rgba(120, 120, 120, 0.55)"
    polygon.strokeWidth = 0.009
  }

  const outerIds = new Set(["T", "B", "L", "R"])
  const netColorMap = new Map<string, string>()
  let netColorIndex = 0
  let polyIndex = 0
  for (const region of regions) {
    const hasPolygon = region.d.polygon && region.d.polygon.length >= 3
    if (!hasPolygon) continue

    const suffix = region.regionId.split(":").pop() ?? ""
    const isOuter = outerIds.has(suffix)
    if (!isOuter && !region.d.isConnectionRegion) {
      if (!netColorMap.has(suffix)) {
        netColorMap.set(
          suffix,
          NET_COLOR_PALETTE[netColorIndex % NET_COLOR_PALETTE.length],
        )
        netColorIndex++
      }
      if (graphics.polygons[polyIndex]) {
        graphics.polygons[polyIndex].fill = netColorMap.get(suffix)!
      }
    }
    polyIndex++
  }

  if (!graphics.circles) graphics.circles = []
  for (const [netName, vias] of Object.entries(bakedViaTile.viasByNet)) {
    const fill = (netColorMap.get(netName) ?? "rgba(255, 0, 0, 0.35)").replace(
      "0.35",
      "0.5",
    )
    for (const via of vias) {
      graphics.circles.push({
        center: via.position,
        radius: via.diameter / 2,
        fill,
        label: netName,
      })
    }
  }

  return getSvgFromGraphicsObject(graphics)
}

function toAbsPath(input: string): string {
  return path.isAbsolute(input) ? input : path.resolve(process.cwd(), input)
}

function outputPathsForInput(inputPath: string): {
  bakedJsonPath: string
  bakedSvgPath: string
} {
  const ext = path.extname(inputPath)
  const base = ext ? inputPath.slice(0, -ext.length) : inputPath
  return {
    bakedJsonPath: `${base}-baked.json`,
    bakedSvgPath: `${base}-baked.svg`,
  }
}

async function writeBakedOutputs(
  bakedViaTile: BakedViaTile,
  bakedJsonPath: string,
  bakedSvgPath: string,
): Promise<void> {
  const svg = buildBakedViaTileSvg(bakedViaTile)
  await fs.mkdir(path.dirname(bakedJsonPath), { recursive: true })
  await fs.writeFile(
    bakedJsonPath,
    `${JSON.stringify(bakedViaTile, null, 2)}\n`,
    "utf8",
  )
  await fs.mkdir(path.dirname(bakedSvgPath), { recursive: true })
  await fs.writeFile(bakedSvgPath, `${svg}\n`, "utf8")
}

async function main() {
  const inputArgs = process.argv.slice(2)
  const inputPaths =
    inputArgs.length > 0
      ? inputArgs.map(toAbsPath)
      : DEFAULT_INPUT_FILES.map((name) => path.join(ASSETS_DIR, name))

  for (const inputPath of inputPaths) {
    const fileContent = await fs.readFile(inputPath, "utf8")
    const viaTile: ViaTile = JSON.parse(fileContent)
    const bakedViaTile = bakeViaTile(viaTile)
    const { bakedJsonPath, bakedSvgPath } = outputPathsForInput(inputPath)

    await writeBakedOutputs(bakedViaTile, bakedJsonPath, bakedSvgPath)

    const regionCount = bakedViaTile.regions.length
    const viaRegionCount = bakedViaTile.regions.filter(
      (r) => r.isViaRegion,
    ).length
    const convexRegionCount = regionCount - viaRegionCount

    console.log(
      `Baked ${path.basename(inputPath)} -> ${path.basename(bakedJsonPath)} (${regionCount} regions: ${convexRegionCount} convex + ${viaRegionCount} via)`,
    )
    console.log(`SVG: ${bakedSvgPath}`)
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
