import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { createGraphWithConnectionsFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"

const baseGraph = generateJumperX4Grid({
  cols: 1,
  rows: 1,
  marginX: 0.5,
  marginY: 0.5,
  outerPaddingX: 0.8,
  outerPaddingY: 0.8,
})

const graphWithConnections = createGraphWithConnectionsFromBaseGraph(
  baseGraph,
  [
    {
      start: { x: -2.55, y: 1.0 },
      end: { x: 2.55, y: -1.0 },
      connectionId: "A",
    },
    {
      start: { x: 0, y: 2.955 },
      end: { x: -2.55, y: -1.0 },
      connectionId: "B",
    },
    {
      start: { x: 0, y: -2.955 },
      end: { x: 2.55, y: 1.0 },
      connectionId: "C",
    },
  ],
)

export default () => (
  <GenericSolverDebugger
    createSolver={() =>
      new JumperGraphSolver({
        inputGraph: {
          regions: graphWithConnections.regions,
          ports: graphWithConnections.ports,
        },
        inputConnections: graphWithConnections.connections,
      })
    }
  />
)
