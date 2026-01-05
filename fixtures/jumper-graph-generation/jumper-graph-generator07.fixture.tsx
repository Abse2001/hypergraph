import { InteractiveGraphics } from "graphics-debug/react"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

const jumperX4Grid = generateJumperX4Grid({
  cols: 1,
  rows: 1,
  marginX: 1,
  marginY: 1,
})

const graphics = visualizeJumperGraph(jumperX4Grid)

export default () => <InteractiveGraphics graphics={graphics} />
