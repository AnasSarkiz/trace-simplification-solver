import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { TraceSimplificationSolver } from "../index"

test("invalid effort fails before simplification starts", (): void => {
  for (const effort of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(
      () =>
        new TraceSimplificationSolver({
          hdRoutes: [],
          obstacles: [],
          connMap: new ConnectivityMap({}),
          colorMap: {},
          defaultViaDiameter: 0.3,
          layerCount: 2,
          effort,
        }),
    ).toThrow("effort must be a positive finite number")
  }
})
