import type { GraphicsObject } from "graphics-debug"
import type { Candidate } from "../types"
import type { JPort, JRegion, JumperGraph } from "./jumper-types"
import { visualizeJumperGraph } from "./visualizeJumperGraph"
import type { JumperGraphSolver } from "./JumperGraphSolver"

export const visualizeJumperGraphSolver = (
  solver: JumperGraphSolver,
): GraphicsObject => {
  const jumperGraph: JumperGraph = {
    regions: solver.graph.regions as JRegion[],
    ports: solver.graph.ports as JPort[],
  }

  const graphics = visualizeJumperGraph(jumperGraph, {
    connections: solver.connections,
    hideRegionPortLines: true,
    hideConnectionLines: true,
    hidePortPoints: true,
  }) as Required<GraphicsObject>

  // Draw active connection line
  if (solver.currentConnection) {
    const startRegion = solver.currentConnection.startRegion as JRegion
    const endRegion = solver.currentConnection.endRegion as JRegion

    const startCenter = {
      x: (startRegion.d.bounds.minX + startRegion.d.bounds.maxX) / 2,
      y: (startRegion.d.bounds.minY + startRegion.d.bounds.maxY) / 2,
    }
    const endCenter = {
      x: (endRegion.d.bounds.minX + endRegion.d.bounds.maxX) / 2,
      y: (endRegion.d.bounds.minY + endRegion.d.bounds.maxY) / 2,
    }

    const midX = (startCenter.x + endCenter.x) / 2
    const midY = (startCenter.y + endCenter.y) / 2

    graphics.lines.push({
      points: [startCenter, endCenter],
      strokeColor: "rgba(255, 50, 150, 0.8)",
      strokeDash: [10, 5],
    })

    graphics.points.push({
      x: midX,
      y: midY,
      color: "rgba(200, 0, 100, 1)",
      label: solver.currentConnection.connectionId,
    })
  }

  // Draw solved routes
  for (const solvedRoute of solver.solvedRoutes) {
    const pathPoints: { x: number; y: number }[] = []

    for (const candidate of solvedRoute.path) {
      const port = candidate.port as JPort
      pathPoints.push({ x: port.d.x, y: port.d.y })
    }

    if (pathPoints.length > 0) {
      graphics.lines.push({
        points: pathPoints,
        strokeColor: "rgba(0, 200, 0, 0.8)",
      })
    }
  }

  // Draw candidates (at most 10)
  const candidates = solver.candidateQueue.peekMany(10)
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const candidate = candidates[candidateIndex] as Candidate<JRegion, JPort>
    const port = candidate.port as JPort
    const isNext = candidateIndex === 0

    graphics.points.push({
      x: port.d.x,
      y: port.d.y,
      color: isNext ? "green" : "rgba(128, 128, 128, 0.25)",
      label: [
        candidate.port.portId,
        `g: ${candidate.g.toFixed(2)}`,
        `h: ${candidate.h.toFixed(2)}`,
        `f: ${candidate.f.toFixed(2)}`,
      ].join("\n"),
    })
  }

  // Draw current path being explored (from lastCandidate back to start)
  if (solver.lastCandidate) {
    const activePath: { x: number; y: number }[] = []
    let cursor: Candidate | undefined = solver.lastCandidate

    while (cursor) {
      const port = cursor.port as JPort
      activePath.unshift({ x: port.d.x, y: port.d.y })
      cursor = cursor.parent
    }

    if (activePath.length > 1) {
      graphics.lines.push({
        points: activePath,
        strokeColor: "rgba(255, 165, 0, 0.8)",
        strokeDash: [5, 3],
      })
    }
  }

  return graphics
}
