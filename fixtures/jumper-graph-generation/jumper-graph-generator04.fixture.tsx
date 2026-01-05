import { InteractiveGraphics } from "graphics-debug/react"
import { generateSingleJumperX2Regions } from "lib/JumperGraphSolver/jumper-graph-generator/generateSingleJumperX2Regions"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

const singleJumperX2Topology = generateSingleJumperX2Regions({
  center: { x: 0, y: 0 },
  idPrefix: "jumperX2",
})

const graphics = visualizeJumperGraph(singleJumperX2Topology)

export default () => <InteractiveGraphics graphics={graphics} />
