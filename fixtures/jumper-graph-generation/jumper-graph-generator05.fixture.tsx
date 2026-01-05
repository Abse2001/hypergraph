import { InteractiveGraphics } from "graphics-debug/react"
import { generateJumperX2Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX2Grid"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

const jumperX2GridTopology = generateJumperX2Grid({
  cols: 3,
  rows: 3,
  marginX: 2,
  marginY: 1,
  xChannelPointCount: 3,
  yChannelPointCount: 2,
})

const graphics = visualizeJumperGraph(jumperX2GridTopology)

export default () => <InteractiveGraphics graphics={graphics} />
