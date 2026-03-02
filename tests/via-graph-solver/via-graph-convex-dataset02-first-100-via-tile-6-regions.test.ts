import { test } from "bun:test"
import viaTile6Regions from "assets/ViaGraphSolver/via-tile-6-regions.json"
import { solveFirstHundredSamples } from "../fixtures/via-graph-convex-dataset02-100-samples.helper"

test.skip("via-graph-convex-dataset02: solve first 100 samples with via-tile-6-regions.json", () => {
  // tileWidth and tileHeight are now read from the JSON file
  solveFirstHundredSamples(viaTile6Regions, "via-tile-6-regions.json", {})
}, 300000)
