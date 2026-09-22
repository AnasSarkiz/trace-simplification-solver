import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { gunzipSync } from "node:zlib"
import { parseArgs } from "node:util"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import {
  TraceSimplificationSolver,
  type TraceSimplificationSolverOptions,
} from "../index"

type Fixture = {
  source: { repository: string; commit: string; input: string }
  options: Omit<
    TraceSimplificationSolverOptions,
    "connMap" | "netByConnectionName" | "terminalLayerIndicesByPcbPortId"
  >
  netMap: Record<string, string[]>
  netByConnectionName?: Array<[string, string]>
  terminalLayerIndicesByPcbPortId?: Array<[string, number[]]>
}
type SolverConstructor = new (
  options: TraceSimplificationSolverOptions,
) => {
  solve(): void
  solved: boolean
  failed: boolean
  error: string | null
  simplifiedHdRoutes: TraceSimplificationSolverOptions["hdRoutes"]
}
type Variant = {
  name: string
  Solver: SolverConstructor
  samplesMs: number[]
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    fixture: { type: "string", default: "bugreport107" },
    runs: { type: "string", default: "7" },
    warmups: { type: "string", default: "2" },
    compare: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
})
if (values.help) {
  console.log(`Usage: bun run benchmark [options]
  --fixture bugreport107|crossing-vias|/path/to/input.json[.gz]
  --runs 7             Measured runs per version
  --warmups 2          Unmeasured runs per version
  --compare /path/to/index.ts  Compare another checkout exporting TraceSimplificationSolver
  --output result.json Save raw samples, summary statistics, and output checksum

Timings cover constructor + solve only. Inputs are rebuilt and garbage collected
outside the timer. Comparison order alternates each round. Every output, including
warmups, must match exactly. Run on an otherwise idle machine.`)
  process.exit(0)
}
const runs = Number(values.runs)
const warmups = Number(values.warmups)
if (
  !Number.isInteger(runs) ||
  runs < 1 ||
  !Number.isInteger(warmups) ||
  warmups < 0
) {
  throw new Error(
    "runs must be a positive integer; warmups must be nonnegative",
  )
}
const fixturePath =
  values.fixture === "bugreport107" || values.fixture === "crossing-vias"
    ? new URL(
        `../benchmarks/fixtures/${values.fixture}.json${values.fixture === "bugreport107" ? ".gz" : ""}`,
        import.meta.url,
      ).pathname
    : resolve(values.fixture!)
const buffer = await Bun.file(fixturePath).arrayBuffer()
const fixture: Fixture = JSON.parse(
  (fixturePath.endsWith(".gz")
    ? gunzipSync(buffer)
    : Buffer.from(buffer)
  ).toString(),
)
const variants: Variant[] = [
  { name: "current", Solver: TraceSimplificationSolver, samplesMs: [] },
]
if (values.compare) {
  const module = await import(pathToFileURL(resolve(values.compare)).href)
  if (typeof module.TraceSimplificationSolver !== "function") {
    throw new Error("Comparison module must export TraceSimplificationSolver")
  }
  variants.push({
    name: "comparison",
    Solver: module.TraceSimplificationSolver,
    samplesMs: [],
  })
}
let expectedChecksum: string | undefined
for (let round = 0; round < warmups + runs; round++) {
  const order = round % 2 === 0 ? variants : [...variants].reverse()
  for (const variant of order) {
    const options: TraceSimplificationSolverOptions = {
      ...structuredClone(fixture.options),
      connMap: new ConnectivityMap(structuredClone(fixture.netMap)),
      netByConnectionName: fixture.netByConnectionName
        ? new Map(fixture.netByConnectionName)
        : undefined,
      terminalLayerIndicesByPcbPortId: fixture.terminalLayerIndicesByPcbPortId
        ? new Map(
            fixture.terminalLayerIndicesByPcbPortId.map(([id, layers]) => [
              id,
              new Set(layers),
            ]),
          )
        : undefined,
    }
    Bun.gc(true)
    const started = performance.now()
    const solver = new variant.Solver(options)
    solver.solve()
    const elapsed = performance.now() - started
    if (!solver.solved || solver.failed)
      throw new Error(`${variant.name}: ${solver.error}`)
    const checksum = createHash("sha256")
      .update(JSON.stringify(solver.simplifiedHdRoutes))
      .digest("hex")
    expectedChecksum ??= checksum
    if (checksum !== expectedChecksum) {
      throw new Error(`Output mismatch in ${variant.name}, round ${round + 1}`)
    }
    if (round >= warmups) variant.samplesMs.push(elapsed)
    console.error(
      `${round < warmups ? "warmup" : "measured"} ${round + 1}: ${variant.name} ${elapsed.toFixed(2)} ms`,
    )
  }
}
const summarize = (samples: number[]): Record<string, number> => {
  const sorted = [...samples].sort((a, b) => a - b)
  const quantile = (fraction: number): number => {
    const index = (sorted.length - 1) * fraction
    const lower = Math.floor(index)
    return (
      sorted[lower]! +
      (sorted[Math.ceil(index)]! - sorted[lower]!) * (index - lower)
    )
  }
  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length
  return {
    min: sorted[0]!,
    p25: quantile(0.25),
    median: quantile(0.5),
    p75: quantile(0.75),
    max: sorted[sorted.length - 1]!,
    mean,
    standardDeviation: Math.sqrt(
      samples.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) /
        samples.length,
    ),
  }
}
const report = {
  fixture: values.fixture,
  source: fixture.source,
  runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
  comparisonModule: values.compare ? resolve(values.compare) : null,
  runs,
  warmups,
  routes: fixture.options.hdRoutes.length,
  points: fixture.options.hdRoutes.reduce(
    (sum, route) => sum + route.route.length,
    0,
  ),
  obstacles: fixture.options.obstacles.length,
  outputSha256: expectedChecksum,
  variants: variants.map(({ name, samplesMs }) => ({
    name,
    samplesMs,
    summaryMs: summarize(samplesMs),
  })),
}
const json = JSON.stringify(report, null, 2)
console.log(json)
if (values.output) await Bun.write(values.output, `${json}\n`)
