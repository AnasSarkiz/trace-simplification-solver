import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { SingleSimplifiedPathSolver5 } from "../../lib/solvers/SimplifiedPathSolver/SingleSimplifiedPathSolver5_Deg45"
import type { HighDensityRoute } from "../../lib/types/high-density-types"
import { minimumDistanceBetweenSegments } from "../../lib/utils/minimumDistanceBetweenSegments"
import fixture from "../fixtures/blocked-path-bend.json"

function getTraceGap(routes: {
  signal: HighDensityRoute
  peer: HighDensityRoute
}): number {
  let gap = Number.POSITIVE_INFINITY
  for (let i = 1; i < routes.signal.route.length; i++) {
    for (let j = 1; j < routes.peer.route.length; j++) {
      gap = Math.min(
        gap,
        minimumDistanceBetweenSegments(
          routes.signal.route[i - 1],
          routes.signal.route[i],
          routes.peer.route[j - 1],
          routes.peer.route[j],
        ) -
          routes.signal.traceThickness / 2 -
          routes.peer.traceThickness / 2,
      )
    }
  }
  return gap
}

test("blocked path sampling preserves bends and trace clearance", (): void => {
  // Reduced from the third cleanup pass of the RP2040 motor controller.
  const inputSnapshot = structuredClone(fixture)
  const solver = new SingleSimplifiedPathSolver5({
    ...fixture,
    obstacles: [],
    connMap: new ConnectivityMap({}),
    colorMap: {},
    useTraceWidthAwareClearance: true,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  for (const peer of fixture.otherHdRoutes.slice(0, 2)) {
    expect(
      getTraceGap({ signal: fixture.inputRoute, peer }),
    ).toBeGreaterThanOrEqual(0.1)
    expect(
      getTraceGap({ signal: solver.simplifiedRoute, peer }),
    ).toBeGreaterThanOrEqual(0.1)
  }
  expect(solver.simplifiedRoute.route[0]).toEqual(fixture.inputRoute.route[0])
  expect(solver.simplifiedRoute.route.at(-1)).toEqual(
    fixture.inputRoute.route.at(-1),
  )
  expect(fixture).toEqual(inputSnapshot)
})
