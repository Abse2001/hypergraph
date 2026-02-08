#!/usr/bin/env bun

import fs from "node:fs/promises"
import path from "node:path"

type Point = {
  x: number
  y: number
}

type Via = {
  viaId: string
  diameter: number
  position: Point
}

type ViasByNet = Record<string, Via[]>

function parseNetTable(pcbText: string): Map<number, string> {
  const netById = new Map<number, string>()
  const netRe = /^\s*\(net\s+(\d+)\s+"([^"]*)"\)\s*$/gm
  let match: RegExpExecArray | null
  while ((match = netRe.exec(pcbText)) !== null) {
    netById.set(Number(match[1]), match[2])
  }
  return netById
}

function getViaBlocks(lines: string[]): string[] {
  const blocks: string[] = []
  let inVia = false
  let depth = 0
  let current: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const opens = (line.match(/\(/g) || []).length
    const closes = (line.match(/\)/g) || []).length

    if (!inVia && line.startsWith("(via")) {
      inVia = true
      current = [line]
      depth = opens - closes
      if (depth <= 0) {
        blocks.push(current.join("\n"))
        inVia = false
      }
      continue
    }

    if (inVia) {
      current.push(line)
      depth += opens - closes
      if (depth <= 0) {
        blocks.push(current.join("\n"))
        inVia = false
        current = []
      }
    }
  }

  return blocks
}

function parseVia(
  viaBlock: string,
  index: number,
  netById: Map<number, string>,
): { netName: string; via: Via } | null {
  const atMatch = viaBlock.match(/\(at\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)/)
  const sizeMatch = viaBlock.match(/\(size\s+([+-]?\d*\.?\d+)/)
  const netMatch = viaBlock.match(/\(net\s+(\d+)\)/)
  const uuidMatch = viaBlock.match(/\(uuid\s+"([^"]+)"\)/)

  if (!atMatch || !sizeMatch || !netMatch) return null

  const netId = Number(netMatch[1])
  const netName = netById.get(netId) ?? `net_${netId}`
  const viaId = uuidMatch ? uuidMatch[1] : `via_${index + 1}`

  return {
    netName,
    via: {
      viaId,
      diameter: Number(sizeMatch[1]),
      position: {
        x: Number(atMatch[1]),
        y: Number(atMatch[2]),
      },
    },
  }
}

async function main() {
  const inputPath = process.argv[2]
  const outputPath = process.argv[3] ?? "vias-by-net.json"

  if (!inputPath) {
    console.error(
      "Usage: bun scripts/parse-kicad-pcb-vias.ts <input.kicad_pcb> [output.json]",
    )
    process.exit(1)
  }

  const pcbText = await fs.readFile(inputPath, "utf8")
  const lines = pcbText.split(/\r?\n/)

  const netById = parseNetTable(pcbText)
  const viaBlocks = getViaBlocks(lines)

  const viasByNet: ViasByNet = {}
  viaBlocks.forEach((viaBlock, index) => {
    const parsed = parseVia(viaBlock, index, netById)
    if (!parsed) return
    if (!viasByNet[parsed.netName]) viasByNet[parsed.netName] = []
    viasByNet[parsed.netName].push(parsed.via)
  })

  await fs.mkdir(path.dirname(outputPath), { recursive: true }).catch(() => {})
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(viasByNet, null, 2)}\n`,
    "utf8",
  )

  const totalViaCount = Object.values(viasByNet).reduce(
    (sum, vias) => sum + vias.length,
    0,
  )
  console.log(
    `Saved ${totalViaCount} vias across ${Object.keys(viasByNet).length} nets to ${outputPath}`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
