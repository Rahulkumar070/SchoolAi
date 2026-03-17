import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, ArrowRight, FlaskConical } from "lucide-react";
import { connectDB } from "@/lib/mongodb";
import { PublicResearchModel } from "@/models/PublicResearch";
import AnswerRenderer from "@/components/answer/AnswerRenderer";

interface Props {
  params: { slug: string };
}

// Strip [CITATION:xxx] markers and collapse whitespace
function stripCitations(text: string): string {
  return text
    .replace(/\[CITATION:[a-z0-9]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Split answer on ## section headings, keeping each heading with its content
function splitIntoSections(text: string): string[] {
  return text.split(/(?=^##\s)/m).filter((s) => s.trim().length > 0);
}

type ResearchDoc = {
  slug: string;
  query: string;
  answer: string;
  papers: {
    id?: string;
    title: string;
    authors: string[];
    year?: number;
    journal?: string;
    source?: string;
    doi?: string;
    url?: string;
    abstract?: string;
    citationCount?: number;
    badges?: string[];
  }[];
  evidenceIdToPaperId: Record<string, string>;
  createdAt: string;
};

async function getResearch(slug: string): Promise<ResearchDoc | null> {
  try {
    await connectDB();
    const doc = await PublicResearchModel.findOne({ slug }, { __v: 0 }).lean();
    if (!doc) {
      console.log("[research/page] No document found for slug:", slug);
      return null;
    }
    // Serialize BSON types so they're safe to pass as RSC props
    return JSON.parse(JSON.stringify(doc)) as ResearchDoc;
  } catch (err) {
    console.error("[research/page] getResearch error for slug:", slug, err);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = await getResearch(params.slug);
  if (!doc) return { title: "Research Not Found — Researchly" };

  const description = stripCitations(doc.answer).slice(0, 160);
  const pageUrl = `https://researchly.in/research/${params.slug}`;

  return {
    title: `${doc.query} — Researchly`,
    description,
    openGraph: {
      title: doc.query,
      description,
      url: pageUrl,
      siteName: "Researchly",
      type: "article",
      images: [{ url: "/api/og", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: doc.query,
      description,
      images: ["/api/og"],
    },
    alternates: {
      canonical: pageUrl,
    },
  };
}

export default async function PublicResearchPage({ params }: Props) {
  console.log("[research/page] rendering slug:", params.slug);
  const doc = await getResearch(params.slug);
  console.log("[research/page] doc found:", !!doc);
  if (!doc) notFound();

  // Explicit cast: notFound() throws (returns never) so doc is guaranteed non-null here,
  // but TypeScript needs the assertion to avoid "Object is possibly null" at runtime.
  const data = doc as ResearchDoc;

  const publishedDate = new Date(data.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const sections = splitIntoSections(data.answer);

  return (
    <>
      <style>{`
        :root {
          --bg:              #141414;
          --bg-raised:       #1a1a1a;
          --bg-overlay:      #1e1e1e;
          --surface:         #222222;
          --border:          rgba(255,255,255,0.06);
          --border-mid:      rgba(255,255,255,0.09);
          --text-primary:    #e8e3dc;
          --text-secondary:  #b0aa9e;
          --text-muted:      #666;
          --text-faint:      #3a3a3a;
          --brand:           #c9b99a;
          --brand-dim:       rgba(201,185,154,0.07);
          --brand-border:    rgba(201,185,154,0.18);
          --brand-hover:     #b8a589;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

        .pr-page {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text-primary);
        }

        /* ── STICKY TOP BANNER ── */
        .pr-top-banner {
          position: sticky;
          top: 0;
          z-index: 60;
          background: var(--brand);
          padding: 10px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .pr-top-banner-text {
          font-size: 13px;
          font-weight: 500;
          color: #1a1408;
          letter-spacing: -0.01em;
        }
        .pr-top-banner-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12.5px;
          font-weight: 700;
          color: #fff;
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(0,0,0,0.18);
          padding: 5px 13px;
          border-radius: 7px;
          text-decoration: none;
          white-space: nowrap;
          transition: background 0.15s;
        }
        .pr-top-banner-btn:hover { background: rgba(0,0,0,0.38); }
        @media (max-width: 600px) {
          .pr-top-banner { gap: 10px; padding: 9px 16px; }
          .pr-top-banner-text { font-size: 12px; text-align: center; }
        }

        /* ── NAV ── */
        .pr-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 28px;
          border-bottom: 1px solid var(--border);
          position: sticky; top: 41px; z-index: 50;
          background: rgba(20,20,20,0.92);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .pr-logo {
          display: flex; align-items: center; gap: 8px;
          text-decoration: none;
        }
        .pr-logo-box {
          width: 28px; height: 28px; border-radius: 8px;
          background: var(--brand);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .pr-logo-text {
          font-size: 15px; font-weight: 600;
          color: var(--text-primary); letter-spacing: -0.01em;
        }
        .pr-nav-cta {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 600;
          color: #000;
          padding: 7px 14px; border-radius: 8px;
          background: var(--brand); border: none;
          cursor: pointer; text-decoration: none;
          transition: background 0.15s;
        }
        .pr-nav-cta:hover { background: var(--brand-hover, #b8a589); }
        .logo-light { display: block; }
        .logo-dark  { display: none; }
        [data-theme="dark"] .logo-dark  { display: block; }
        [data-theme="dark"] .logo-light { display: none; }

        /* ── MAIN CONTENT ── */
        .pr-main {
          max-width: 780px;
          margin: 0 auto;
          padding: 48px 24px 80px;
        }

        /* ── BREADCRUMB ── */
        .pr-breadcrumb {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; color: var(--text-muted);
          margin-bottom: 28px;
        }
        .pr-breadcrumb a {
          color: var(--text-muted); text-decoration: none;
        }
        .pr-breadcrumb a:hover { color: var(--text-secondary); }
        .pr-breadcrumb-sep { opacity: 0.4; }

        /* ── QUERY HEADER ── */
        .pr-query-label {
          display: flex; align-items: center; gap: 7px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--brand);
          margin-bottom: 14px;
        }
        .pr-query-label svg { opacity: 0.75; }
        .pr-query-h1 {
          font-size: clamp(1.45rem, 3.5vw, 2rem);
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.03em;
          line-height: 1.25;
          margin-bottom: 10px;
        }
        .pr-meta {
          font-size: 12px; color: var(--text-muted);
          margin-bottom: 36px;
        }

        /* ── ANSWER CARD ── */
        .pr-answer-card {
          background: var(--bg-raised);
          border: 1px solid var(--border-mid);
          border-radius: 16px;
          padding: 32px 36px;
          margin-bottom: 24px;
        }

        /* ── INLINE CTA ── */
        .pr-inline-cta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 13px 20px;
          margin: 0 0 24px;
          background: var(--brand-dim);
          border: 1px solid var(--brand-border);
          border-radius: 10px;
          font-size: 13px;
          color: var(--text-muted);
        }
        .pr-inline-cta a {
          color: var(--brand);
          text-decoration: none;
          font-weight: 600;
          white-space: nowrap;
        }
        .pr-inline-cta a:hover { text-decoration: underline; }

        /* ── BOTTOM CTA BLOCK ── */
        .pr-bottom-cta {
          background: var(--bg-raised);
          border: 1px solid var(--brand-border);
          border-radius: 16px;
          padding: 36px 40px;
          margin-bottom: 48px;
          text-align: center;
        }
        .pr-bottom-cta h2 {
          font-size: clamp(1.1rem, 2.5vw, 1.4rem);
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.025em;
          line-height: 1.3;
          margin-bottom: 12px;
        }
        .pr-bottom-cta p {
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.65;
          max-width: 460px;
          margin: 0 auto 24px;
        }
        .pr-bottom-cta-btns {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .pr-cta-btn-primary {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 14px; font-weight: 700;
          color: #000; background: var(--brand);
          padding: 11px 24px; border-radius: 9px;
          text-decoration: none; white-space: nowrap;
          transition: background 0.15s;
        }
        .pr-cta-btn-primary:hover { background: var(--brand-hover, #b8a589); }
        .pr-cta-btn-outline {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 14px; font-weight: 600;
          color: var(--text-secondary);
          border: 1px solid var(--border-mid);
          padding: 11px 24px; border-radius: 9px;
          text-decoration: none; white-space: nowrap;
          transition: border-color 0.15s, color 0.15s;
        }
        .pr-cta-btn-outline:hover { border-color: var(--brand-border); color: var(--brand); }

        @media (max-width: 600px) {
          .pr-answer-card { padding: 20px 16px; }
          .pr-main { padding: 32px 16px 60px; }
          .pr-nav { padding: 12px 16px; top: 39px; }
          .pr-bottom-cta { padding: 28px 20px; }
        }

        /* ── FOOTER ── */
        .pr-footer {
          max-width: 780px; margin: 0 auto;
          padding: 0 24px 40px;
          font-size: 12px; color: var(--text-faint);
          border-top: 1px solid var(--border);
          padding-top: 20px;
          display: flex; justify-content: space-between;
          align-items: center; flex-wrap: wrap; gap: 8px;
        }
        .pr-footer a {
          color: var(--brand); text-decoration: none;
        }
        .pr-footer a:hover { text-decoration: underline; }
      `}</style>

      <div className="pr-page">
        {/* ── STICKY TOP BANNER ── */}
        <div className="pr-top-banner">
          <span className="pr-top-banner-text">
            🔍 Research any topic with AI-powered citations — Try Researchly free
          </span>
          <Link href="/search" className="pr-top-banner-btn">
            Start Researching <ArrowRight size={12} />
          </Link>
        </div>

        {/* ── NAV ── */}
        <nav className="pr-nav">
          <Link href="/" className="pr-logo">
            <img src="/researchly-logo-light.svg" alt="Researchly" height="32" className="logo-light" />
            <img src="/researchly-logo-full.svg"  alt="Researchly" height="32" className="logo-dark" />
          </Link>
          <Link href="/search" className="pr-nav-cta">
            Try free <ArrowRight size={13} />
          </Link>
        </nav>

        {/* ── MAIN ── */}
        <main className="pr-main">
          {/* Breadcrumb */}
          <div className="pr-breadcrumb">
            <Link href="/">Home</Link>
            <span className="pr-breadcrumb-sep">/</span>
            <Link href="/search">Research</Link>
            <span className="pr-breadcrumb-sep">/</span>
            <span style={{ color: "var(--text-secondary)" }}>
              {data.query.length > 50
                ? data.query.slice(0, 50) + "…"
                : data.query}
            </span>
          </div>

          {/* Query header */}
          <div className="pr-query-label">
            <FlaskConical size={12} />
            AI Research Answer
          </div>
          <h1 className="pr-query-h1">{data.query}</h1>
          <p className="pr-meta">
            {data.papers.length > 0 && (
              <>{data.papers.length} cited papers · </>
            )}
            {publishedDate} · Powered by Researchly AI
          </p>

          {/* Answer — split into sections, inject inline CTA after every 2nd section */}
          {sections.map((section, i) => (
            <div key={i}>
              <div className="pr-answer-card">
                <AnswerRenderer
                  content={section}
                  citedPapers={data.papers as any}
                  evidenceIdToPaperId={data.evidenceIdToPaperId}
                  streaming={false}
                />
              </div>
              {/* Inject inline CTA after every 2nd section, but not after the last */}
              {(i + 1) % 2 === 0 && i < sections.length - 1 && (
                <div className="pr-inline-cta">
                  Want to research your own topic?{" "}
                  <Link href="/search">Try it free →</Link>
                </div>
              )}
            </div>
          ))}

          {/* Bottom CTA Block */}
          <div className="pr-bottom-cta">
            <h2>Research smarter with AI-powered citations</h2>
            <p>
              Researchly finds and cites academic papers for any research topic
              in seconds. Used by students across India.
            </p>
            <div className="pr-bottom-cta-btns">
              <Link href="/search" className="pr-cta-btn-primary">
                Try Free <ArrowRight size={14} />
              </Link>
              <Link href="/pricing" className="pr-cta-btn-outline">
                See Pricing
              </Link>
            </div>
          </div>
        </main>

        {/* ── FOOTER ── */}
        <footer className="pr-footer">
          <span>© 2026 Researchly · Made in India 🇮🇳</span>
          <a href="mailto:hello.researchly@gmail.com">
            hello.researchly@gmail.com
          </a>
        </footer>
      </div>
    </>
  );
}
