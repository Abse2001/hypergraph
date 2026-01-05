import { InteractiveGraphics } from "graphics-debug/react"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

const jumperX4Grid = generateJumperX4Grid({
  cols: 2,
  rows: 2,
  marginX: 1,
  marginY: 1,
  regionsBetweenPads: true,
})

const graphics = visualizeJumperGraph(jumperX4Grid)

export default () => <InteractiveGraphics graphics={graphics} />
