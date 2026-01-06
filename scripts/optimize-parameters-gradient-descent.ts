import { generateJumperX4Grid } from "../lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { createProblemFromBaseGraph } from "../lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import { JumperGraphSolver } from "../lib/JumperGraphSolver/JumperGraphSolver"

const SAMPLES_PER_EPOCH = 500
const NUM_EPOCHS = 50
const LEARNING_RATE = 0.5
const EPSILON = 0.02 // For finite difference gradient approximation
const MIN_CROSSINGS = 2
const MAX_CROSSINGS = 12

// Track used seeds globally to never repeat
const usedSeeds = new Set<number>()
let seedCounter = 0

function getUniqueSeed(): number {
  while (usedSeeds.has(seedCounter)) {
    seedCounter++
  }
  usedSeeds.add(seedCounter)
  return seedCounter++
}

interface Parameters {
  portUsagePenalty: number
  portUsagePenaltySq: number
  crossingPenalty: number
  crossingPenaltySq: number
  ripCost: number
  greedyMultiplier: number
}

const createBaseGraph = (orientation: "vertical" | "horizontal" = "vertical") =>
  generateJumperX4Grid({
    cols: 1,
    rows: 1,
    marginX: 1.2,
    marginY: 1.2,
    outerPaddingX: 2,
    outerPaddingY: 2,
    innerColChannelPointCount: 3,
    innerRowChannelPointCount: 3,
    outerChannelXPointCount: 5,
    outerChannelYPointCount: 5,
    regionsBetweenPads: true,
    orientation,
  })

// Generate sample configurations (crossing count + seed)
function generateSampleConfigs(
  count: number,
): { numCrossings: number; seed: number }[] {
  const configs: { numCrossings: number; seed: number }[] = []
  for (let i = 0; i < count; i++) {
    // Distribute crossings evenly across range
    const numCrossings =
      MIN_CROSSINGS + (i % (MAX_CROSSINGS - MIN_CROSSINGS + 1))
    configs.push({ numCrossings, seed: getUniqueSeed() })
  }
  return configs
}

// Evaluate parameters on a set of samples, returns success rate (0-1)
function evaluateParameters(
  params: Parameters,
  samples: { numCrossings: number; seed: number }[],
): number {
  let successes = 0

  for (const { numCrossings, seed } of samples) {
    let solved = false

    for (const orientation of ["vertical", "horizontal"] as const) {
      const graphWithConnections = createProblemFromBaseGraph({
        baseGraph: createBaseGraph(orientation),
        numCrossings,
        randomSeed: seed,
      })

      const solver = new JumperGraphSolver({
        inputGraph: {
          regions: graphWithConnections.regions,
          ports: graphWithConnections.ports,
        },
        inputConnections: graphWithConnections.connections,
        portUsagePenalty: params.portUsagePenalty,
        crossingPenalty: params.crossingPenalty,
        ripCost: params.ripCost,
      })

      // Apply additional parameters that aren't in constructor
      ;(solver as any).portUsagePenaltySq = params.portUsagePenaltySq
      ;(solver as any).crossingPenaltySq = params.crossingPenaltySq
      ;(solver as any).greedyMultiplier = params.greedyMultiplier

      solver.solve()

      if (solver.solved) {
        solved = true
        break
      }
    }

    if (solved) {
      successes++
    }
  }

  return successes / samples.length
}

// Compute gradient using finite differences
function computeGradient(
  params: Parameters,
  samples: { numCrossings: number; seed: number }[],
  baseScore: number,
): Parameters {
  const gradient: Parameters = {
    portUsagePenalty: 0,
    portUsagePenaltySq: 0,
    crossingPenalty: 0,
    crossingPenaltySq: 0,
    ripCost: 0,
    greedyMultiplier: 0,
  }

  const paramKeys: (keyof Parameters)[] = [
    "portUsagePenalty",
    "portUsagePenaltySq",
    "crossingPenalty",
    "crossingPenaltySq",
    "ripCost",
    "greedyMultiplier",
  ]

  for (const key of paramKeys) {
    const perturbedParams = { ...params }
    // Use proportional epsilon for larger values
    const eps = key === "ripCost" ? EPSILON * 10 : EPSILON
    perturbedParams[key] += eps

    const perturbedScore = evaluateParameters(perturbedParams, samples)
    gradient[key] = (perturbedScore - baseScore) / eps
  }

  return gradient
}

// Apply gradient update with constraints
function updateParameters(
  params: Parameters,
  gradient: Parameters,
  lr: number,
): Parameters {
  const newParams: Parameters = {
    portUsagePenalty: Math.max(
      0,
      params.portUsagePenalty + lr * gradient.portUsagePenalty,
    ),
    portUsagePenaltySq: Math.max(
      0,
      params.portUsagePenaltySq + lr * gradient.portUsagePenaltySq,
    ),
    crossingPenalty: Math.max(
      0,
      params.crossingPenalty + lr * gradient.crossingPenalty,
    ),
    crossingPenaltySq: Math.max(
      0,
      params.crossingPenaltySq + lr * gradient.crossingPenaltySq,
    ),
    ripCost: Math.max(1, params.ripCost + lr * gradient.ripCost * 10), // Scale ripCost updates
    greedyMultiplier: Math.max(
      0.1,
      params.greedyMultiplier + lr * gradient.greedyMultiplier,
    ),
  }
  return newParams
}

function formatParams(params: Parameters): string {
  return [
    `portUsagePenalty=${params.portUsagePenalty.toFixed(3)}`,
    `portUsagePenaltySq=${params.portUsagePenaltySq.toFixed(3)}`,
    `crossingPenalty=${params.crossingPenalty.toFixed(3)}`,
    `crossingPenaltySq=${params.crossingPenaltySq.toFixed(3)}`,
    `ripCost=${params.ripCost.toFixed(3)}`,
    `greedyMultiplier=${params.greedyMultiplier.toFixed(3)}`,
  ].join(", ")
}

function formatGradient(gradient: Parameters): string {
  return [
    `d_portUsagePenalty=${gradient.portUsagePenalty.toFixed(4)}`,
    `d_portUsagePenaltySq=${gradient.portUsagePenaltySq.toFixed(4)}`,
    `d_crossingPenalty=${gradient.crossingPenalty.toFixed(4)}`,
    `d_crossingPenaltySq=${gradient.crossingPenaltySq.toFixed(4)}`,
    `d_ripCost=${gradient.ripCost.toFixed(6)}`,
    `d_greedyMultiplier=${gradient.greedyMultiplier.toFixed(4)}`,
  ].join(", ")
}

async function main() {
  console.log("JumperGraphSolver Parameter Optimization via Gradient Descent")
  console.log("=".repeat(70))
  console.log(`Samples per epoch: ${SAMPLES_PER_EPOCH}`)
  console.log(`Number of epochs: ${NUM_EPOCHS}`)
  console.log(`Learning rate: ${LEARNING_RATE}`)
  console.log(`Epsilon for gradient: ${EPSILON}`)
  console.log("=".repeat(70))
  console.log()

  // Initial parameters (current defaults)
  let params: Parameters = {
    portUsagePenalty: 0.3,
    portUsagePenaltySq: 0.1,
    crossingPenalty: 6,
    crossingPenaltySq: 0.1,
    ripCost: 40,
    greedyMultiplier: 0.45,
  }

  console.log("Initial parameters:")
  console.log(formatParams(params))
  console.log()

  let bestParams = { ...params }
  let bestScore = 0

  for (let epoch = 0; epoch < NUM_EPOCHS; epoch++) {
    const startTime = performance.now()

    // Generate unique samples for this epoch
    const samples = generateSampleConfigs(SAMPLES_PER_EPOCH)

    // Evaluate current parameters
    const currentScore = evaluateParameters(params, samples)

    // Compute gradient
    const gradient = computeGradient(params, samples, currentScore)

    // Update parameters
    const prevParams = { ...params }
    params = updateParameters(params, gradient, LEARNING_RATE)

    // Compute delta (parameter changes)
    const delta: Parameters = {
      portUsagePenalty: params.portUsagePenalty - prevParams.portUsagePenalty,
      portUsagePenaltySq:
        params.portUsagePenaltySq - prevParams.portUsagePenaltySq,
      crossingPenalty: params.crossingPenalty - prevParams.crossingPenalty,
      crossingPenaltySq:
        params.crossingPenaltySq - prevParams.crossingPenaltySq,
      ripCost: params.ripCost - prevParams.ripCost,
      greedyMultiplier: params.greedyMultiplier - prevParams.greedyMultiplier,
    }

    // Track best
    if (currentScore > bestScore) {
      bestScore = currentScore
      bestParams = { ...prevParams }
    }

    const duration = ((performance.now() - startTime) / 1000).toFixed(1)

    console.log(
      `Epoch ${(epoch + 1).toString().padStart(3)}/${NUM_EPOCHS} | Success rate: ${(currentScore * 100).toFixed(2)}% | Time: ${duration}s`,
    )
    console.log(`  Parameters: ${formatParams(prevParams)}`)
    console.log(`  Gradient:   ${formatGradient(gradient)}`)
    console.log(`  Delta:      ${formatParams(delta)}`)
    console.log()
  }

  console.log("=".repeat(70))
  console.log("Optimization Complete!")
  console.log("=".repeat(70))
  console.log()
  console.log(`Best success rate: ${(bestScore * 100).toFixed(2)}%`)
  console.log(`Best parameters:`)
  console.log(formatParams(bestParams))
  console.log()
  console.log("Final parameters after all epochs:")
  console.log(formatParams(params))
  console.log()
  console.log(`Total unique seeds used: ${usedSeeds.size}`)
}

main().catch(console.error)
