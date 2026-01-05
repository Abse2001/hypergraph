import { InteractiveGraphics } from "graphics-debug/react"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

const jumperX4Grid = generateJumperX4Grid({
  cols: 3,
  rows: 3,
  marginX: 2,
  marginY: 1,
  xChannelPointCount: 3,
  yChannelPointCount: 2,
})

const graphics = visualizeJumperGraph(jumperX4Grid)

export default () => <InteractiveGraphics graphics={graphics} />
