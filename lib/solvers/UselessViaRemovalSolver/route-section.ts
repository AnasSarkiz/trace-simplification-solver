import type { HighDensityRoute } from "../../types/high-density-types"

export interface RouteSection {
  startIndex: number
  endIndex: number
  z: number
  points: HighDensityRoute["route"]
}
