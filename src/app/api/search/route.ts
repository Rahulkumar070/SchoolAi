import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { generateAnswer } from "@/lib/ai";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { getCachedResult, saveToCache } from "@/lib/cache";
import { checkGuestLimit } from "@/lib/guestLimit";
import { Paper } from "@/types";

/**
 * Extract only the papers that were actually cited in the generated answer.
 *
 * The RAG answer uses two citation formats:
 *  1. Inline cards:  "> 📄 **Paper:** Some Title Here"
 *  2. REF markers:   "[REF-1]", "[REF-2]", etc.
 *
 * We match cited titles back against the full paper list and return
 * only those papers (max 5). Falls back to the top 5 papers if nothing
 * is matched (e.g. the answer was very short or format was unexpected).
 */
function extractCitedPapers(answer: string, papers: Paper[]): Paper[] {
  const cited: Paper[] = [];
  const seen = new Set<string>();

  // ── Strategy 1: parse inline citation cards ──────────────
  // Format: > 📄 **Paper:** Exact Title Here
  const cardTitles: string[] = [];
  const cardRe = />\s*📄\s*\*\*Paper:\*\*\s*(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(answer)) !== null) {
    cardTitles.push(
      m[1]
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ""),
    );
  }

  for (const paper of papers) {
    const normTitle = paper.title.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    const key = normTitle.slice(0, 60);
    if (seen.has(key)) continue;

    // Fuzzy match: cited card title must share 4+ words with the paper title
    const matched = cardTitles.some((cardTitle) => {
      const cardWords = new Set(
        cardTitle.split(/\s+/).filter((w) => w.length > 3),
      );
      const paperWords = normTitle.split(/\s+/).filter((w) => w.length > 3);
      const overlap = paperWords.filter((w) => cardWords.has(w)).length;
      return (
        overlap >= 4 ||
        (overlap >= 2 && normTitle.includes(cardTitle.slice(0, 30)))
      );
    });

    if (matched) {
      seen.add(key);
      cited.push(paper);
    }
  }

  // ── Strategy 2: REF-N index markers ─────────────────────
  // Format: [REF-1], [REF-2], etc. (used by stream route; may appear in non-stream too)
  if (cited.length === 0) {
    const citedIndices = new Set<number>();
    const refRe = /\[REF-(\d+)\]/g;
    while ((m = refRe.exec(answer)) !== null) {
      citedIndices.add(parseInt(m[1], 10) - 1); // 0-based
    }
    for (const idx of citedIndices) {
      if (papers[idx] && !seen.has(papers[idx].id)) {
        seen.add(papers[idx].id);
        cited.push(papers[idx]);
      }
    }
  }

  // ── Fallback: return top 5 papers if nothing was matched ─
  if (cited.length === 0) {
    return papers.slice(0, 5);
  }

  // Hard cap at 5 — matches the citation limit enforced in the prompt
  return cited.slice(0, 5);
}

// ── Limits ──────────────────────────────────────────────
const FREE_DAILY_LIMIT = 5; // logged in, free plan
const STUDENT_MONTHLY_LIMIT = 500; // paid student plan
// Pro = unlimited

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query: string };
    if (!query?.trim() || query.trim().length < 3)
      return NextResponse.json({ error: "Query too short" }, { status: 400 });

    const q = query.trim();
    const session = await getServerSession(authOptions);
    await connectDB();

    // ── Check global cache first (saves API cost) ──────────
    const cached = await getCachedResult(q);

    // ══════════════════════════════════════════════════════
    // LOGGED IN USER
    // ══════════════════════════════════════════════════════
    if (session?.user?.email) {
      const now = new Date();

      let u = await UserModel.findOne({ email: session.user.email });
      if (!u) {
        u = await UserModel.create({
          email: session.user.email,
          name: session.user.name ?? "",
          image: session.user.image ?? "",
          plan: "free",
          searchesToday: 0,
          searchDateReset: now,
          searchesThisMonth: 0,
          searchMonthReset: now,
          searchHistory: [],
        });
      }

      const plan = u.plan ?? "free";

      // ── Check plan limits ────────────────────────────────
      if (plan === "free") {
        // Reset daily counter if new day
        if (
          now.toDateString() !==
          new Date(u.searchDateReset ?? now).toDateString()
        ) {
          u.searchesToday = 0;
          u.searchDateReset = now;
        }
        if (u.searchesToday >= FREE_DAILY_LIMIT) {
          return NextResponse.json(
            {
              error: `You've used all ${FREE_DAILY_LIMIT} free searches today. Upgrade to Student plan for 500 searches/month at ₹199.`,
            },
            { status: 429 },
          );
        }
      } else if (plan === "student") {
        // Reset monthly counter if new month
        const rd = new Date(u.searchMonthReset ?? now);
        if (
          now.getMonth() !== rd.getMonth() ||
          now.getFullYear() !== rd.getFullYear()
        ) {
          u.searchesThisMonth = 0;
          u.searchMonthReset = now;
        }
        if (u.searchesThisMonth >= STUDENT_MONTHLY_LIMIT) {
          return NextResponse.json(
            {
              error: `You've used all ${STUDENT_MONTHLY_LIMIT} searches this month. Upgrade to Pro for unlimited searches at ₹499.`,
            },
            { status: 429 },
          );
        }
      }
      // plan === "pro" → no limit check, falls through

      // ── Get answer ──────────────────────────────────────
      let answer: string;
      let allPapers: Paper[]; // full set sent to source panel on search page
      let citedPapers: Paper[]; // only cited papers — saved to history

      if (cached) {
        answer = cached.answer;
        allPapers = cached.papers as Paper[];
        // Re-extract cited papers from cached answer so history stays clean
        citedPapers = extractCitedPapers(answer, allPapers);
      } else {
        const fetchedPapers = await searchAll(q);
        if (!fetchedPapers.length)
          return NextResponse.json(
            { error: "No papers found. Try different keywords." },
            { status: 404 },
          );
        answer = await generateAnswer(q, fetchedPapers);
        allPapers = fetchedPapers;
        // Cache full paper set so future hits have all metadata available
        void saveToCache(q, answer, allPapers);
        // Extract only the 3-5 papers actually cited in the answer for history
        citedPapers = extractCitedPapers(answer, fetchedPapers);
      }

      // ── Update counter ──────────────────────────────────
      const counterUpdate: Record<string, unknown> = {};
      if (plan === "free") {
        counterUpdate.searchesToday = (u.searchesToday ?? 0) + 1;
        counterUpdate.searchDateReset = u.searchDateReset;
      } else if (plan === "student") {
        counterUpdate.searchesThisMonth = (u.searchesThisMonth ?? 0) + 1;
        counterUpdate.searchMonthReset = u.searchMonthReset;
      }
      // pro: no counter needed

      // ── Save to history (cited papers only, no duplicates) ─
      const existingIdx = (u.searchHistory ?? []).findIndex(
        (h: { query: string }) => h.query.toLowerCase() === q.toLowerCase(),
      );

      if (existingIdx !== -1) {
        await UserModel.findByIdAndUpdate(u._id, {
          $set: {
            ...counterUpdate,
            [`searchHistory.${existingIdx}.answer`]: answer,
            [`searchHistory.${existingIdx}.papers`]: citedPapers,
            [`searchHistory.${existingIdx}.searchedAt`]: now,
          },
        });
      } else {
        await UserModel.findByIdAndUpdate(u._id, {
          $set: counterUpdate,
          $push: {
            searchHistory: {
              $each: [
                { query: q, answer, papers: citedPapers, searchedAt: now },
              ],
              $position: 0,
              $slice: 50,
            },
          },
        });
      }

      return NextResponse.json({
        papers: allPapers, // full set for the source panel on the search page
        answer,
        query: q,
        fromCache: !!cached,
      });
    }

    // ══════════════════════════════════════════════════════
    // GUEST USER — fingerprint + cookie dual tracking
    // Survives: browser close, reopen, incognito, cookie clear
    // ══════════════════════════════════════════════════════
    const guestCheck = await checkGuestLimit(req);

    // Helper to attach cookie to any response
    const withGuestCookie = (res: NextResponse): NextResponse => {
      res.cookies.set("_rly_gid", guestCheck.fingerprintId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      });
      return res;
    };

    if (!guestCheck.allowed) {
      return withGuestCookie(
        NextResponse.json(
          {
            error: `Guest limit reached (${guestCheck.limit}/day). Sign in free to get 5 searches every day — no credit card needed.`,
          },
          { status: 429 },
        ),
      );
    }

    // Serve from cache or generate
    if (cached) {
      return withGuestCookie(
        NextResponse.json({
          papers: cached.papers,
          answer: cached.answer,
          query: q,
          fromCache: true,
        }),
      );
    }

    const fp = await searchAll(q);
    if (!fp.length) {
      return withGuestCookie(
        NextResponse.json({ error: "No papers found." }, { status: 404 }),
      );
    }
    const ans = await generateAnswer(q, fp);
    void saveToCache(q, ans, fp);
    return withGuestCookie(
      NextResponse.json({
        papers: fp,
        answer: ans,
        query: q,
        fromCache: false,
      }),
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Search failed" },
      { status: 500 },
    );
  }
}
