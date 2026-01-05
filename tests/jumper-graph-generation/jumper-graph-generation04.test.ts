import { test, expect } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { generateSingleJumperX2Regions } from "lib/JumperGraphSolver/jumper-graph-generator/generateSingleJumperX2Regions"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

test("jumper-graph-generation04 - 0606x2 resistor chip array", () => {
  const singleJumperX2Topology = generateSingleJumperX2Regions({
    center: { x: 0, y: 0 },
    idPrefix: "jumperX2",
  })
  expect(
    getSvgFromGraphicsObject(visualizeJumperGraph(singleJumperX2Topology)),
  ).toMatchSvgSnapshot(import.meta.path)
})
