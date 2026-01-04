import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { JumperGraphSolver } from "../../lib/JumperGraphSolver/JumperGraphSolver"
import inputProblem from "./basics01-input.json"

export default () => (
  <GenericSolverDebugger
    createSolver={() => new JumperGraphSolver(inputProblem)}
  />
)
