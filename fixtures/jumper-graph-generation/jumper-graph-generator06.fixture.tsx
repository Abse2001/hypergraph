import { InteractiveGraphics } from "graphics-debug/react"
import { generateSingleJumperX4Regions } from "lib/JumperGraphSolver/jumper-graph-generator/generateSingleJumperX4Regions"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

const singleJumperX4Topology = generateSingleJumperX4Regions({
  center: { x: 0, y: 0 },
  idPrefix: "jumperX4",
})

const graphics = visualizeJumperGraph(singleJumperX4Topology)

export default () => <InteractiveGraphics graphics={graphics} />
