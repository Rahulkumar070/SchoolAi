/**
 * Researchly Regression Benchmark Runner
 *
 * Usage:
 *   npm run benchmark                          # run all queries
 *   npm run benchmark -- --id bert-gpt-t5-comparison   # run one query
 *   BENCHMARK_URL=http://localhost:3001 npm run benchmark
 *
 * Requires the dev server to be running.
 * Results are saved to benchmark/results/YYYY-MM-DD-HH-MM.json
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  BENCHMARK_QUERIES,
  type BenchmarkQuery,
  type BenchmarkChecks,
  type BackboneEntry,
} from "./queries";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BENCHMARK_URL ?? "http://localhost:3001";
const RESULTS_DIR = join(__dirname, "results");

// Session cookie for authenticated requests.
// Copy from browser devtools → Application → Cookies → next-auth.session-token.
// Set: BENCHMARK_COOKIE="next-auth.session-token=xxx" npm run benchmark
const SESSION_COOKIE = process.env.BENCHMARK_COOKIE ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// Paper type (minimal — only what the runner needs)
// ─────────────────────────────────────────────────────────────────────────────

interface Paper {
  id?: string;
  title: string;
  authors: string[];
  year?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE stream parser
// ─────────────────────────────────────────────────────────────────────────────

interface QueryResult {
  answer: string;
  /** citedPapers from the SSE papers event (new field name) or papers (old). */
  citedPapers: Paper[];
  /** evidenceId → paperId map from the SSE papers event. */
  evidenceIdToPaperId: Record<string, string>;
  /**
   * [CITATION:xxx] tags in the answer whose evidenceId is NOT in
   * evidenceIdToPaperId — these silently disappear on the client.
   * A non-empty set is a real failure; bare [CITATION:xxx] in raw SSE
   * text is normal and intentional (client resolves them).
   */
  orphanedCitationIds: string[];
  hasStandaloneDigits: boolean;
  hasDoubleWarning: boolean;
  durationMs: number;
  error?: string;
}

async function streamQuery(query: string): Promise<QueryResult> {
  const start = Date.now();

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/search/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SESSION_COOKIE ? { Cookie: SESSION_COOKIE } : {}),
      },
      body: JSON.stringify({ query }),
    });
  } catch (e) {
    return {
      answer: "",
      citedPapers: [],
      evidenceIdToPaperId: {},
      orphanedCitationIds: [],
      hasStandaloneDigits: false,
      hasDoubleWarning: false,
      durationMs: Date.now() - start,
      error: `Fetch failed — is the dev server running at ${BASE_URL}? (${String(e)})`,
    };
  }

  if (!res.ok || !res.body) {
    return {
      answer: "",
      citedPapers: [],
      evidenceIdToPaperId: {},
      orphanedCitationIds: [],
      hasStandaloneDigits: false,
      hasDoubleWarning: false,
      durationMs: Date.now() - start,
      error: `HTTP ${res.status}`,
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let answer = "";
  let streamedText = "";
  let citedPapers: Paper[] = [];
  let evidenceIdToPaperId: Record<string, string> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let evt: Record<string, unknown>;
        try {
          evt = JSON.parse(line.slice(6)) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (evt.type === "text") {
          streamedText += (evt.text as string) ?? "";
        }
        if (evt.type === "answer_replace") {
          // Verification passes may replace the streamed text — prefer this.
          answer = (evt.text as string) ?? "";
        }
        if (evt.type === "papers") {
          // Accept both new (citedPapers) and old (papers) field names.
          citedPapers =
            (evt.citedPapers as Paper[] | undefined) ??
            (evt.papers as Paper[] | undefined) ??
            [];
          evidenceIdToPaperId =
            (evt.evidenceIdToPaperId as Record<string, string> | undefined) ?? {};
        }
      }
    }
  } catch (e) {
    return {
      answer,
      citedPapers,
      evidenceIdToPaperId,
      orphanedCitationIds: [],
      hasStandaloneDigits: false,
      hasDoubleWarning: false,
      durationMs: Date.now() - start,
      error: `Stream read error: ${String(e)}`,
    };
  }

  // If answer_replace never arrived, fall back to accumulated streamed text.
  const finalAnswer = answer || streamedText;

  // Orphaned citations: [CITATION:xxx] in the answer where xxx is not in
  // evidenceIdToPaperId. These resolve to "" on the client — a silent failure.
  const orphanedCitationIds: string[] = [];
  for (const m of [...finalAnswer.matchAll(/\[CITATION:([a-z0-9]+)\](?:⚠️)?/gi)]) {
    const eid = m[1];
    if (!(eid in evidenceIdToPaperId)) {
      orphanedCitationIds.push(eid);
    }
  }

  return {
    answer: finalAnswer,
    citedPapers,
    evidenceIdToPaperId,
    orphanedCitationIds,
    hasStandaloneDigits: /^\s*\d+\s*$/m.test(finalAnswer),
    hasDoubleWarning: /⚠️⚠️/.test(finalAnswer),
    durationMs: Date.now() - start,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validators
// ─────────────────────────────────────────────────────────────────────────────

interface CheckFailure {
  rule: string;
  expected: string;
  actual: string;
}

function matchesPaper(paper: Paper, entry: BackboneEntry): boolean {
  if (entry.matchBy === "id") {
    return paper.id === entry.match;
  }
  return paper.title.toLowerCase().includes(entry.match.toLowerCase());
}

function runChecks(
  result: QueryResult,
  checks: BenchmarkChecks,
): CheckFailure[] {
  const failures: CheckFailure[] = [];

  // Count check
  const count = result.citedPapers.length;
  if (count < checks.minCitedPapers || count > checks.maxCitedPapers) {
    failures.push({
      rule: "citedPapers count",
      expected: `${checks.minCitedPapers}–${checks.maxCitedPapers}`,
      actual: String(count),
    });
  }

  // Backbone checks
  if (checks.requireAllBackbone) {
    for (const entry of checks.requiredBackbone) {
      const found = result.citedPapers.some((p) => matchesPaper(p, entry));
      if (!found) {
        failures.push({
          rule: "requiredBackbone (all)",
          expected: `"${entry.label}" present in cited panel`,
          actual: "not found",
        });
      }
    }
  } else if (checks.requiredBackbone.length > 0) {
    const anyFound = checks.requiredBackbone.some((entry) =>
      result.citedPapers.some((p) => matchesPaper(p, entry)),
    );
    if (!anyFound) {
      const labels = checks.requiredBackbone.map((e) => e.label).join(", ");
      failures.push({
        rule: "requiredBackbone (any)",
        expected: `at least one of: ${labels}`,
        actual: "none found",
      });
    }
  }

  // Forbidden sole-displacement check:
  // If a required backbone paper is missing AND a forbidden-displacement paper
  // is the one present instead, that's a displacement failure.
  const missingBackbone = checks.requiredBackbone.filter(
    (entry) => !result.citedPapers.some((p) => matchesPaper(p, entry)),
  );
  if (missingBackbone.length > 0 && checks.forbiddenSoleDisplacement.length > 0) {
    for (const forbidden of checks.forbiddenSoleDisplacement) {
      const displacerPresent = result.citedPapers.some((p) =>
        matchesPaper(p, forbidden),
      );
      if (displacerPresent) {
        const missingLabels = missingBackbone.map((e) => e.label).join(", ");
        failures.push({
          rule: "forbiddenSoleDisplacement",
          expected: `no "${forbidden.label}" displacing backbone`,
          actual: `"${forbidden.label}" present while missing: ${missingLabels}`,
        });
      }
    }
  }

  // Artifact checks
  if (checks.noOrphanedCitations && result.orphanedCitationIds.length > 0) {
    const ids = result.orphanedCitationIds.slice(0, 5).join(", ");
    failures.push({
      rule: "noOrphanedCitations",
      expected: "every [CITATION:xxx] in the answer maps to a known paper",
      actual: `orphaned evidenceIds (no mapping in evidenceIdToPaperId): ${ids}`,
    });
  }
  if (checks.noStandaloneDigits && result.hasStandaloneDigits) {
    failures.push({
      rule: "noStandaloneDigits",
      expected: "no bare digit lines",
      actual: "standalone digit line(s) found",
    });
  }
  if (checks.noDoubleWarning && result.hasDoubleWarning) {
    failures.push({
      rule: "noDoubleWarning",
      expected: "no ⚠️⚠️ double-warning artifacts",
      actual: "double ⚠️ found on at least one citation",
    });
  }

  return failures;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

interface QueryReport {
  id: string;
  description: string;
  query: string;
  pass: boolean;
  durationMs: number;
  citedPaperCount: number;
  citedPaperTitles: string[];
  failures: CheckFailure[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

function pad(s: string, n: number) {
  return s.padEnd(n, " ").slice(0, n);
}

async function runBenchmark(queries: BenchmarkQuery[]): Promise<void> {
  const reports: QueryReport[] = [];

  console.log(`\nResearchly Regression Benchmark`);
  console.log(`Server:  ${BASE_URL}`);
  console.log(`Auth:    ${SESSION_COOKIE ? "cookie set ✓" : "NO COOKIE — guest path only (rate-limited, unreliable)"}`);
  if (!SESSION_COOKIE) {
    console.log(`\n  To fix: copy next-auth.session-token from browser devtools`);
    console.log(`  Then:   BENCHMARK_COOKIE="next-auth.session-token=xxx" npm run benchmark\n`);
  }
  console.log(`Queries: ${queries.length}\n`);
  console.log("─".repeat(72));

  for (const bq of queries) {
    process.stdout.write(`Running  ${pad(bq.id, 36)} … `);

    let result: QueryResult;
    try {
      result = await streamQuery(bq.query);
    } catch (e) {
      result = {
        answer: "",
        citedPapers: [],
        evidenceIdToPaperId: {},
        orphanedCitationIds: [],
        hasStandaloneDigits: false,
        hasDoubleWarning: false,
        durationMs: 0,
        error: String(e),
      };
    }

    const failures = result.error ? [] : runChecks(result, bq.checks);
    const pass = !result.error && failures.length === 0;

    const label = result.error
      ? "ERROR  "
      : pass
        ? "PASS   "
        : `FAIL(${failures.length})`;

    console.log(`${label}  ${result.durationMs}ms  cited=${result.citedPapers.length}`);

    if (!pass) {
      if (result.error) {
        console.log(`  ✗ ${result.error}`);
      }
      for (const f of failures) {
        console.log(`  ✗ [${f.rule}]`);
        console.log(`      expected: ${f.expected}`);
        console.log(`      actual:   ${f.actual}`);
      }
    }

    reports.push({
      id: bq.id,
      description: bq.description,
      query: bq.query,
      pass,
      durationMs: result.durationMs,
      citedPaperCount: result.citedPapers.length,
      citedPaperTitles: result.citedPapers.map((p) => p.title),
      failures,
      error: result.error,
    });
  }

  console.log("─".repeat(72));

  const passed = reports.filter((r) => r.pass).length;
  const failed = reports.length - passed;
  console.log(`\nResult: ${passed}/${reports.length} passed, ${failed} failed\n`);

  // Save results
  mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .replace(/\..+/, "");
  const outPath = join(RESULTS_DIR, `${ts}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        server: BASE_URL,
        summary: { total: reports.length, passed, failed },
        reports,
      },
      null,
      2,
    ),
  );
  console.log(`Results saved → benchmark/results/${ts}.json\n`);

  if (failed > 0) process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

const filterArg = process.argv.indexOf("--id");
const filterId = filterArg !== -1 ? process.argv[filterArg + 1] : null;

const queriesToRun = filterId
  ? BENCHMARK_QUERIES.filter((q) => q.id === filterId)
  : BENCHMARK_QUERIES;

if (queriesToRun.length === 0) {
  console.error(`No benchmark query found with id "${filterId}".`);
  process.exit(1);
}

runBenchmark(queriesToRun);
