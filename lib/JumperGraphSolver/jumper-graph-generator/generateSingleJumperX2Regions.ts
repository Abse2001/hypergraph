import type { JPort, JRegion } from "../jumper-types"

// 0606x2 resistor chip array dimensions
// This is a 2-element array with 4 pads total (2 per resistor)
// Layout is two resistors stacked vertically:
//   [P1]--TJ1--[P2]   (top row)
//   [P3]--TJ2--[P4]   (bottom row)
export const dims0606x2 = {
  padLength: 0.8, // L direction (horizontal, along resistor)
  padWidth: 0.45, // W direction (vertical)
  pitch: 0.8, // center-to-center between pads horizontally (within one resistor)
  rowPitch: 0.8, // center-to-center between rows vertically
  outerSpan: 2.2, // outer edge to outer edge horizontally
}

export const generateSingleJumperX2Regions = ({
  center,
  idPrefix,
}: {
  center: { x: number; y: number }
  idPrefix: string
}) => {
  const regions: JRegion[] = []
  const ports: JPort[] = []

  const { padLength, padWidth, pitch, rowPitch } = dims0606x2

  const padHalfLength = padLength / 2
  const padHalfWidth = padWidth / 2

  // Horizontal pad centers (same for both rows)
  const leftPadCenterX = center.x - pitch / 2
  const rightPadCenterX = center.x + pitch / 2

  // Vertical row centers
  const topRowCenterY = center.y + rowPitch / 2
  const bottomRowCenterY = center.y - rowPitch / 2

  // Helper to create bounds for a pad at given center
  const createPadBounds = (padCenterX: number, padCenterY: number) => ({
    minX: padCenterX - padHalfLength,
    maxX: padCenterX + padHalfLength,
    minY: padCenterY - padHalfWidth,
    maxY: padCenterY + padHalfWidth,
  })

  // Top row pads (P1 left, P2 right)
  const pad1Bounds = createPadBounds(leftPadCenterX, topRowCenterY)
  const pad2Bounds = createPadBounds(rightPadCenterX, topRowCenterY)

  // Bottom row pads (P3 left, P4 right)
  const pad3Bounds = createPadBounds(leftPadCenterX, bottomRowCenterY)
  const pad4Bounds = createPadBounds(rightPadCenterX, bottomRowCenterY)

  // Underjumper regions (between pads within each resistor row)
  const underjumper1Bounds = {
    minX: pad1Bounds.maxX,
    maxX: pad2Bounds.minX,
    minY: topRowCenterY - padHalfWidth,
    maxY: topRowCenterY + padHalfWidth,
  }

  const underjumper2Bounds = {
    minX: pad3Bounds.maxX,
    maxX: pad4Bounds.minX,
    minY: bottomRowCenterY - padHalfWidth,
    maxY: bottomRowCenterY + padHalfWidth,
  }

  // Gap region between the two rows (horizontally spanning the full width)
  const centerGapBounds = {
    minX: pad1Bounds.minX,
    maxX: pad2Bounds.maxX,
    minY: pad3Bounds.maxY,
    maxY: pad1Bounds.minY,
  }

  // Throughjumper regions (conductive body of each resistor)
  const throughjumperHeight = 0.3
  const throughjumper1Bounds = {
    minX: leftPadCenterX,
    maxX: rightPadCenterX,
    minY: topRowCenterY - throughjumperHeight / 2,
    maxY: topRowCenterY + throughjumperHeight / 2,
  }

  const throughjumper2Bounds = {
    minX: leftPadCenterX,
    maxX: rightPadCenterX,
    minY: bottomRowCenterY - throughjumperHeight / 2,
    maxY: bottomRowCenterY + throughjumperHeight / 2,
  }

  // Surrounding region thickness
  const surroundSize = 0.5

  // The full extent of all main regions
  const mainMinX = pad1Bounds.minX
  const mainMaxX = pad2Bounds.maxX
  const mainMinY = pad3Bounds.minY // bottom row
  const mainMaxY = pad1Bounds.maxY // top row

  // Helper to create a region
  const createRegion = (
    id: string,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    isPad: boolean,
    isThroughJumper?: boolean,
  ): JRegion => ({
    regionId: `${idPrefix}:${id}`,
    ports: [],
    d: { bounds, isPad, isThroughJumper },
  })

  // Create pad regions
  const pad1 = createRegion("pad1", pad1Bounds, true)
  const pad2 = createRegion("pad2", pad2Bounds, true)
  const pad3 = createRegion("pad3", pad3Bounds, true)
  const pad4 = createRegion("pad4", pad4Bounds, true)

  // Create underjumper regions
  const underjumper1 = createRegion("underjumper1", underjumper1Bounds, false)
  const underjumper2 = createRegion("underjumper2", underjumper2Bounds, false)

  // Create center gap region (between rows)
  const centerGap = createRegion("centerGap", centerGapBounds, false)

  // Create throughjumper regions
  const throughjumper1 = createRegion(
    "throughjumper1",
    throughjumper1Bounds,
    false,
    true,
  )
  const throughjumper2 = createRegion(
    "throughjumper2",
    throughjumper2Bounds,
    false,
    true,
  )

  // Create surrounding regions
  const top = createRegion(
    "T",
    {
      minX: mainMinX - surroundSize,
      maxX: mainMaxX + surroundSize,
      minY: mainMaxY,
      maxY: mainMaxY + surroundSize,
    },
    false,
  )

  const bottom = createRegion(
    "B",
    {
      minX: mainMinX - surroundSize,
      maxX: mainMaxX + surroundSize,
      minY: mainMinY - surroundSize,
      maxY: mainMinY,
    },
    false,
  )

  const left = createRegion(
    "L",
    {
      minX: mainMinX - surroundSize,
      maxX: mainMinX,
      minY: mainMinY,
      maxY: mainMaxY,
    },
    false,
  )

  const right = createRegion(
    "R",
    {
      minX: mainMaxX,
      maxX: mainMaxX + surroundSize,
      minY: mainMinY,
      maxY: mainMaxY,
    },
    false,
  )

  regions.push(
    pad1,
    pad2,
    pad3,
    pad4,
    underjumper1,
    underjumper2,
    centerGap,
    throughjumper1,
    throughjumper2,
    top,
    bottom,
    left,
    right,
  )

  // Helper to create a port at the boundary between two regions
  const createPort = (
    id: string,
    region1: JRegion,
    region2: JRegion,
  ): JPort => {
    const b1 = region1.d.bounds
    const b2 = region2.d.bounds

    let x: number
    let y: number
    if (Math.abs(b1.maxX - b2.minX) < 0.001) {
      // region1 is left of region2
      x = b1.maxX
      y = (Math.max(b1.minY, b2.minY) + Math.min(b1.maxY, b2.maxY)) / 2
    } else if (Math.abs(b1.minX - b2.maxX) < 0.001) {
      // region1 is right of region2
      x = b1.minX
      y = (Math.max(b1.minY, b2.minY) + Math.min(b1.maxY, b2.maxY)) / 2
    } else if (Math.abs(b1.maxY - b2.minY) < 0.001) {
      // region1 is below region2
      x = (Math.max(b1.minX, b2.minX) + Math.min(b1.maxX, b2.maxX)) / 2
      y = b1.maxY
    } else {
      // region1 is above region2
      x = (Math.max(b1.minX, b2.minX) + Math.min(b1.maxX, b2.maxX)) / 2
      y = b1.minY
    }

    const port: JPort = {
      portId: `${idPrefix}:${id}`,
      region1,
      region2,
      d: { x, y },
    }
    region1.ports.push(port)
    region2.ports.push(port)
    return port
  }

  // Surrounding frame corner connections
  ports.push(createPort("T-L", top, left))
  ports.push(createPort("T-R", top, right))
  ports.push(createPort("B-L", bottom, left))
  ports.push(createPort("B-R", bottom, right))

  // Top row (P1, P2) - pad connections to surrounding regions
  ports.push(createPort("T-P1", top, pad1))
  ports.push(createPort("L-P1", left, pad1))
  ports.push(createPort("T-P2", top, pad2))
  ports.push(createPort("R-P2", right, pad2))

  // Bottom row (P3, P4) - pad connections to surrounding regions
  ports.push(createPort("B-P3", bottom, pad3))
  ports.push(createPort("L-P3", left, pad3))
  ports.push(createPort("B-P4", bottom, pad4))
  ports.push(createPort("R-P4", right, pad4))

  // Underjumper1 connections (left and right only - NO ports to pads)
  ports.push(createPort("T-UJ1", top, underjumper1))

  // Underjumper2 connections (left and right only - NO ports to pads)
  ports.push(createPort("B-UJ2", bottom, underjumper2))

  // Center gap connections to left and right
  ports.push(createPort("L-CG", left, centerGap))
  ports.push(createPort("R-CG", right, centerGap))

  // Center gap connections to pads (between rows)
  ports.push(createPort("CG-P1", centerGap, pad1))
  ports.push(createPort("CG-P2", centerGap, pad2))
  ports.push(createPort("CG-P3", centerGap, pad3))
  ports.push(createPort("CG-P4", centerGap, pad4))

  // Throughjumper1 connections (ports at the center of each pad in top row)
  const tj1LeftPort: JPort = {
    portId: `${idPrefix}:TJ1-P1`,
    region1: throughjumper1,
    region2: pad1,
    d: { x: leftPadCenterX, y: topRowCenterY },
  }
  throughjumper1.ports.push(tj1LeftPort)
  pad1.ports.push(tj1LeftPort)
  ports.push(tj1LeftPort)

  const tj1RightPort: JPort = {
    portId: `${idPrefix}:TJ1-P2`,
    region1: throughjumper1,
    region2: pad2,
    d: { x: rightPadCenterX, y: topRowCenterY },
  }
  throughjumper1.ports.push(tj1RightPort)
  pad2.ports.push(tj1RightPort)
  ports.push(tj1RightPort)

  // Throughjumper2 connections (ports at the center of each pad in bottom row)
  const tj2LeftPort: JPort = {
    portId: `${idPrefix}:TJ2-P3`,
    region1: throughjumper2,
    region2: pad3,
    d: { x: leftPadCenterX, y: bottomRowCenterY },
  }
  throughjumper2.ports.push(tj2LeftPort)
  pad3.ports.push(tj2LeftPort)
  ports.push(tj2LeftPort)

  const tj2RightPort: JPort = {
    portId: `${idPrefix}:TJ2-P4`,
    region1: throughjumper2,
    region2: pad4,
    d: { x: rightPadCenterX, y: bottomRowCenterY },
  }
  throughjumper2.ports.push(tj2RightPort)
  pad4.ports.push(tj2RightPort)
  ports.push(tj2RightPort)

  return {
    regions,
    ports,
  }
}
