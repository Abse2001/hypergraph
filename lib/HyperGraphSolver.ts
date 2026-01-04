import { BaseSolver } from "@tscircuit/solver-utils"
import { convertSerializedHyperGraphToHyperGraph } from "./convertSerializedHyperGraphToHyperGraph"
import type {
  Candidate,
  Connection,
  RegionPort,
  PortId,
  HyperGraph,
  SerializedConnection,
  SerializedHyperGraph,
  Region,
  RegionId,
  ConnectionId,
  RegionPortAssignment,
} from "./types"
import { convertSerializedConnectionsToConnections } from "./convertSerializedConnectionsToConnections"
import { PriorityQueue } from "./PriorityQueue"

export type SolvedRoute = {
  path: Candidate[]
  connection: Connection
}

export class HyperGraphSolver<
  RegionType extends Region = Region,
  RegionPortType extends RegionPort = RegionPort,
  CandidateType extends Candidate<RegionType, RegionPortType> = Candidate<
    RegionType,
    RegionPortType
  >,
> extends BaseSolver {
  graph: HyperGraph
  connections: Connection[]

  candidateQueue: PriorityQueue<Candidate>
  unprocessedConnections: Connection[]

  solvedRoutes: SolvedRoute[] = []
  assignedPorts: Map<PortId, SolvedRoute> = new Map()

  currentConnection: Connection | null = null
  currentEndRegion: Region | null = null

  greedyMultiplier = 1.0
  rippingEnabled = false
  ripCost = 0
  randomRipFraction = 0

  lastCandidate: Candidate | null = null

  visitedPointsForCurrentConnection: Set<PortId> = new Set()

  constructor(
    public input: {
      inputGraph: HyperGraph | SerializedHyperGraph
      inputConnections: (Connection | SerializedConnection)[]
      greedyMultiplier?: number
      rippingEnabled?: boolean
      ripCost?: number
      randomRipFraction?: number
    },
  ) {
    super()
    this.graph = convertSerializedHyperGraphToHyperGraph(input.inputGraph)
    this.connections = convertSerializedConnectionsToConnections(
      input.inputConnections,
      this.graph,
    )
    if (input.greedyMultiplier) this.greedyMultiplier = input.greedyMultiplier
    this.unprocessedConnections = [...this.connections]
    this.currentConnection = this.unprocessedConnections.shift()!
    this.candidateQueue = new PriorityQueue<Candidate>()
    this.candidateQueue.enqueue({
      port: this.currentConnection.startRegion.ports[0],
      g: 0,
      h: 0,
      f: 0,
      hops: 0,
      ripsRequired: 0,
    })
    this.currentEndRegion = this.currentConnection.endRegion
  }

  computeH(candidate: CandidateType): number {
    return this.estimateCostToEnd(candidate.port)
  }

  /**
   * OVERRIDE THIS
   *
   * Return the estimated remaining cost to the end of the route. You must
   * first understand the UNIT of your costs. If it's distance, then this could
   * be something like distance(port, this.currentEndRegion.d.center)
   */
  estimateCostToEnd(port: RegionPortType): number {
    return 0
  }

  /**
   * OPTIONALLY OVERRIDE THIS
   *
   * This is a penalty for using a port that is not relative to a connection,
   * e.g. maybe this port is in a special area of congestion. Use this to
   * penalize ports that are e.g. likely to block off connections, you may want
   * to use port.ripCount to help determine this penalty, or you can use port
   * position, region volume etc.
   */
  getPortUsagePenalty(port: RegionPortType): number {
    return 0
  }

  /**
   * OVERRIDE THIS
   *
   * Return the cost of using two ports in the region with consideration of
   */
  computeIncreasedRegionCostIfPortsAreUsed(
    region: RegionType,
    port1: RegionPortType,
    port2: RegionPortType,
  ): number {
    return 0
  }

  computeG(candidate: CandidateType): number {
    return (
      candidate.parent!.g +
      this.computeIncreasedRegionCostIfPortsAreUsed(
        candidate.lastRegion!,
        candidate.lastPort!,
        candidate.port,
      )
    )
  }

  /**
   * Return a subset of the candidates for entering a region. These candidates
   * are all possible ways to enter the region- you can e.g. return the middle
   * port to make it so that you're not queueing candidates that are likely
   * redundant.
   */
  selectCandidatesForEnteringRegion(candidates: Candidate[]): Candidate[] {
    return candidates
  }

  getNextCandidates(currentCandidate: CandidateType): CandidateType[] {
    const currentRegion = currentCandidate.nextRegion!
    const currentPort = currentCandidate.port
    const nextCandidatesByRegion: Record<RegionId, Candidate[]> = {}
    for (const port of currentRegion.ports) {
      if (port === currentCandidate.port) continue
      const assignedRoute = this.assignedPorts.get(port.portId)
      const newCandidate: Partial<Candidate> = {
        port,
        hops: currentCandidate.hops + 1,
        parent: currentCandidate,
        lastRegion: currentRegion,
        nextRegion:
          port.region1 === currentRegion ? port.region2 : port.region1,
        lastPort: currentPort,
        ripsRequired:
          currentCandidate.ripsRequired +
          (assignedRoute &&
          assignedRoute.connection.mutuallyConnectedNetworkId !==
            this.currentConnection!.mutuallyConnectedNetworkId
            ? 1
            : 0),
      }

      if (!this.rippingEnabled && newCandidate.ripsRequired! > 0) {
        continue
      }

      nextCandidatesByRegion[newCandidate.nextRegion!.regionId] ??= []
      nextCandidatesByRegion[newCandidate.nextRegion!.regionId].push(
        newCandidate as CandidateType,
      )
    }

    const nextCandidates: Candidate[] = []
    for (const regionId in nextCandidatesByRegion) {
      const nextCandidatesInRegion = nextCandidatesByRegion[regionId]
      nextCandidates.push(
        ...this.selectCandidatesForEnteringRegion(nextCandidatesInRegion),
      )
    }

    for (const nextCandidate of nextCandidates) {
      nextCandidate.g = this.computeG(nextCandidate as CandidateType)
      nextCandidate.h = this.computeH(nextCandidate as CandidateType)
      nextCandidate.f =
        nextCandidate.g + nextCandidate.h * this.greedyMultiplier
    }

    return nextCandidates
  }

  override _step() {
    let currentCandidate = this.candidateQueue.dequeue() as CandidateType
    while (
      currentCandidate &&
      this.visitedPointsForCurrentConnection.has(currentCandidate.port.portId)
    ) {
      currentCandidate = this.candidateQueue.dequeue() as CandidateType
    }
    if (!currentCandidate) {
      this.failed = true
      this.error = "Ran out of candidates"
      return
    }
    this.lastCandidate = currentCandidate
    this.visitedPointsForCurrentConnection.add(currentCandidate.port.portId)

    if (currentCandidate.nextRegion === this.currentEndRegion) {
      return
    }

    const nextCandidates = this.getNextCandidates(currentCandidate)
    for (const nextCandidate of nextCandidates) {
      this.candidateQueue.enqueue(nextCandidate)
    }
  }
}
