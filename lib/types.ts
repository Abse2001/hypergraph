export type PortId = string
export type GraphEdgeId = string
export type RegionId = string
export type ConnectionId = string

export type RegionPort = {
  portId: PortId
  region1: Region
  region2: Region
  d: any
}

export type Region = {
  regionId: RegionId
  ports: RegionPort[]
  d: any
}

export type Candidate<
  RegionType extends Region = Region,
  RegionPortType extends RegionPort = RegionPort,
> = {
  port: RegionPortType
  g: number
  h: number
  f: number
  hops: number
  parent?: Candidate
  lastPort?: RegionPortType
  lastRegion?: RegionType
  nextRegion?: RegionType
}

export type HyperGraph = {
  ports: RegionPort[]
  regions: Region[]
}

export type SerializedGraphPort = Omit<RegionPort, "edges"> & {
  portId: PortId
  region1Id: RegionId
  region2Id: RegionId
}
export type SerializedGraphRegion = Omit<Region, "points"> & {
  pointIds: PortId[]
}
export type SerializedHyperGraph = {
  ports: SerializedGraphPort[]
  regions: SerializedGraphRegion[]
}

export type Connection = {
  connectionId: ConnectionId
  startRegion: Region
  endRegion: Region
}

export type SerializedConnection = {
  connectionId: ConnectionId
  startRegionId: RegionId
  endRegionId: RegionId
}
