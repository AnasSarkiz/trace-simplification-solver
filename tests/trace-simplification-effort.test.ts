import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "../index"
import fixture from "./fixtures/blocked-path-bend.json"

test("effort scales completed cleanup passes", (): void => {
  for (const [effort, passes] of [
    [undefined, 2],
    [0.1, 1],
    [1.5, 3],
    [2, 4],
    [5, 10],
  ] as const) {
    const solver = new TraceSimplificationSolver({
      hdRoutes: [fixture.inputRoute],
      otherHdRoutes: fixture.otherHdRoutes,
      obstacles: [],
      connMap: new ConnectivityMap({}),
      colorMap: {},
      defaultViaDiameter: 0.3,
      layerCount: 2,
      effort,
    })
    solver.solve()
    expect(solver.failed).toBe(false)
    expect(solver.solved).toBe(true)
    expect(solver.simplificationPipelineLoops).toBe(passes)
    expect(solver.simplifiedHdRoutes[0].route[0]).toEqual(
      fixture.inputRoute.route[0],
    )
    expect(solver.simplifiedHdRoutes[0].route.at(-1)).toEqual(
      fixture.inputRoute.route.at(-1),
    )
  }
})
