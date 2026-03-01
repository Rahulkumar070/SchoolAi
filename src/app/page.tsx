"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import {
  Search,
  BookOpen,
  FileText,
  ArrowRight,
  Check,
  Sparkles,
  Zap,
  Crown,
  LogOut,
  LayoutDashboard,
  ChevronDown,
} from "lucide-react";

const EXAMPLES = [
  "How does dopamine regulate reward & motivation?",
  "CRISPR gene editing in cancer treatment",
  "Large language model alignment techniques",
  "Climate tipping points and feedback loops",
];

const FEATURES = [
  {
    icon: Search,
    bg: "rgba(92,154,224,.1)",
    ic: "#5c9ae0",
    title: "AI Research Search",
    desc: "Ask anything in plain English. Get synthesised answers from 200M+ papers with inline citations.",
  },
  {
    icon: BookOpen,
    bg: "rgba(93,184,122,.1)",
    ic: "#5db87a",
    title: "Literature Reviews",
    desc: "Full structured reviews — intro, methodology, findings, gaps — generated in under 30 seconds.",
  },
  {
    icon: FileText,
    bg: "rgba(232,160,69,.1)",
    ic: "#e8a045",
    title: "PDF Chat",
    desc: "Upload any paper. Ask about methods, results, stats. Understands context across 30 pages.",
  },
  {
    icon: Zap,
    bg: "rgba(173,115,224,.1)",
    ic: "#ad73e0",
    title: "Citation Export",
    desc: "APA, MLA, IEEE, Chicago, Vancouver, BibTeX — formatted perfectly, copy or download in one click.",
  },
];

const PLANS = [
  {
    n: "Free",
    p: "₹0",
    period: "",
    hi: false,
    fs: [
      "5 searches/day",
      "AI cited answers",
      "APA & MLA export",
      "Save 20 papers",
    ],
    cta: "Get Started",
    href: "/auth/signin",
  },
  {
    n: "Student",
    p: "₹199",
    period: "/month",
    hi: true,
    fs: [
      "500 searches/month",
      "Literature reviews",
      "All 6 citation formats",
      "20 PDF uploads/month",
      "Full library",
    ],
    cta: "Subscribe Now",
    href: "/pricing",
  },
  {
    n: "Pro",
    p: "₹499",
    period: "/month",
    hi: false,
    fs: [
      "Unlimited searches",
      "Unlimited PDF uploads",
      "API access",
      "Team sharing (5 seats)",
      "Priority support",
    ],
    cta: "Subscribe Now",
    href: "/pricing",
  },
];

function UserMenu({
  session,
}: {
  session: {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      plan?: string;
    };
  };
}) {
  const [open, setOpen] = useState(false);
  const plan = session.user?.plan ?? "free";
  const planLabel =
    plan === "pro" ? "Pro" : plan === "student" ? "Student" : "Free";
  const planColor =
    plan === "pro"
      ? "#5c9ae0"
      : plan === "student"
        ? "var(--brand)"
        : "var(--text-muted)";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 10px 5px 6px",
          borderRadius: 99,
          background: "var(--surface)",
          border: "1px solid var(--border-mid)",
          cursor: "pointer",
        }}
      >
        {session.user?.image ? (
          <Image
            src={session.user.image}
            alt="av"
            width={24}
            height={24}
            style={{ borderRadius: "50%" }}
          />
        ) : (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "var(--brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              color: "#000",
            }}
          >
            {(session.user?.name?.[0] ?? "U").toUpperCase()}
          </div>
        )}
        <span
          style={{
            fontSize: 12.5,
            color: "var(--text-primary)",
            fontWeight: 500,
            maxWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.user?.name?.split(" ")[0] ?? "User"}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: planColor,
            background: `${planColor}1a`,
            padding: "1px 7px",
            borderRadius: 99,
          }}
        >
          {planLabel}
        </span>
        <ChevronDown size={11} style={{ color: "var(--text-faint)" }} />
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 200,
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-mid)",
              borderRadius: 12,
              padding: 8,
              zIndex: 50,
              boxShadow: "0 8px 24px rgba(0,0,0,.5)",
            }}
          >
            <div
              style={{
                padding: "8px 10px 10px",
                borderBottom: "1px solid var(--border)",
                marginBottom: 6,
              }}
            >
              <p
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {session.user?.name ?? "Researcher"}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-faint)",
                  marginTop: 2,
                }}
              >
                {session.user?.email}
              </p>
            </div>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 8,
                fontSize: 12.5,
                color: "var(--text-secondary)",
                textDecoration: "none",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--surface)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <LayoutDashboard size={13} /> My Dashboard
            </Link>
            <Link
              href="/search"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 8,
                fontSize: 12.5,
                color: "var(--text-secondary)",
                textDecoration: "none",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--surface)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <Search size={13} /> Research Search
            </Link>
            <Link
              href="/pricing"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 8,
                fontSize: 12.5,
                color: "var(--text-secondary)",
                textDecoration: "none",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--surface)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <Crown size={13} /> Upgrade Plan
            </Link>
            <div
              style={{
                borderTop: "1px solid var(--border)",
                marginTop: 6,
                paddingTop: 6,
              }}
            >
              <button
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  color: "var(--red)",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(224,92,92,.08)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Home() {
  const [q, setQ] = useState("");
  const router = useRouter();
  const { data: session, status } = useSession();
  const go = (val: string) => {
    if (val.trim()) router.push(`/search?q=${encodeURIComponent(val.trim())}`);
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {/* Nav */}
      <nav className="landing-nav">
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            textDecoration: "none",
          }}
        >
          <div className="logo-mark">
            <BookOpen size={13} color="#000" strokeWidth={2.5} />
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: "var(--text-primary)",
              fontFamily: "var(--font-ui)",
            }}
          >
            Researchly
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href="/search"
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              padding: "5px 10px",
              textDecoration: "none",
            }}
          >
            Search
          </Link>
          <Link
            href="/pricing"
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              padding: "5px 10px",
              textDecoration: "none",
            }}
          >
            Pricing
          </Link>
          {status === "loading" ? (
            <div
              style={{
                width: 80,
                height: 32,
                borderRadius: 99,
                background: "var(--surface)",
                opacity: 0.5,
              }}
            />
          ) : session ? (
            <UserMenu session={session} />
          ) : (
            <Link
              href="/auth/signin"
              className="btn btn-brand"
              style={{
                padding: "7px 16px",
                fontSize: 12.5,
                textDecoration: "none",
              }}
            >
              Get Started
            </Link>
          )}
        </div>
      </nav>

      {/* Logged-in welcome banner */}
      {session && (
        <div
          style={{
            background: "var(--bg-raised)",
            borderBottom: "1px solid var(--border)",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            👋 Welcome back,{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {session.user?.name?.split(" ")[0]}
            </strong>
            !
            {session.user?.plan === "free" && (
              <span style={{ color: "var(--text-muted)" }}>
                &nbsp;·&nbsp; Free plan: 5 searches/day
              </span>
            )}
            {session.user?.plan !== "free" && (
              <span style={{ color: "var(--green)" }}>
                &nbsp;·&nbsp;
                {session.user?.plan === "pro"
                  ? "Pro"
                  : "Student plan — 500 searches/month ✨"}
              </span>
            )}
          </p>

          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/search"
              className="btn btn-brand"
              style={{
                textDecoration: "none",
                padding: "5px 14px",
                fontSize: 12,
              }}
            >
              Start Researching →
            </Link>
            <Link
              href="/dashboard"
              className="btn btn-outline"
              style={{
                textDecoration: "none",
                padding: "5px 14px",
                fontSize: 12,
              }}
            >
              My Dashboard
            </Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "72px 24px 56px",
          textAlign: "center",
        }}
      >
        <div
          className="anim-up"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 13px",
            borderRadius: 99,
            background: "var(--brand-dim)",
            border: "1px solid var(--brand-border)",
            marginBottom: 28,
          }}
        >
          <Sparkles size={11} style={{ color: "var(--brand)" }} />
          <span
            style={{ fontSize: 11.5, fontWeight: 600, color: "var(--brand)" }}
          >
            200M+ papers · Free to start · Made in India 🇮🇳
          </span>
        </div>

        <h1
          className="anim-up d1"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2.6rem,7vw,4rem)",
            fontWeight: 400,
            lineHeight: 1.12,
            color: "var(--text-primary)",
            marginBottom: 18,
          }}
        >
          The research assistant
          <br />
          <em className="glow-text" style={{ fontStyle: "italic" }}>
            built for curious minds
          </em>
        </h1>

        <p
          className="anim-up d2"
          style={{
            fontSize: 15.5,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            maxWidth: 490,
            margin: "0 auto 40px",
          }}
        >
          Search 200M+ academic papers, generate literature reviews, and chat
          with PDFs — powered by Claude AI.
        </p>

        <form
          className="anim-up d3"
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
          style={{ position: "relative", maxWidth: 600, margin: "0 auto 18px" }}
        >
          <div
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-mid)",
              borderRadius: 16,
              padding: "13px 13px 13px 48px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              transition: "border-color .15s, box-shadow .15s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--brand-border)";
              e.currentTarget.style.boxShadow = "var(--brand-glow)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-mid)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 16,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-faint)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask any research question…"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "var(--font-ui)",
                fontSize: 14.5,
                color: "var(--text-primary)",
                padding: 0,
              }}
            />
            <button
              type="submit"
              className="btn btn-brand"
              style={{ padding: "7px 16px", flexShrink: 0 }}
              disabled={!q.trim()}
            >
              Search <ArrowRight size={13} />
            </button>
          </div>
        </form>

        <div
          className="anim-up d4"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => go(ex)}
              style={{
                padding: "5px 11px",
                borderRadius: 99,
                fontSize: 12,
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                transition: "all .14s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--brand-border)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* Stats bar */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-raised)",
          padding: "16px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 8,
            textAlign: "center",
          }}
        >
          {[
            ["200M+", "Papers indexed"],
            ["3", "Live APIs"],
            ["6", "Citation formats"],
            ["<15s", "Answer time"],
          ].map(([n, l]) => (
            <div key={l}>
              <p
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--brand)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {n}
              </p>
              <p
                style={{
                  fontSize: 10.5,
                  color: "var(--text-faint)",
                  marginTop: 2,
                }}
              >
                {l}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section
        style={{ maxWidth: 920, margin: "0 auto", padding: "72px 24px" }}
      >
        <p
          className="label-xs"
          style={{ textAlign: "center", marginBottom: 10 }}
        >
          What you can do
        </p>
        <h2
          style={{
            textAlign: "center",
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.6rem,4vw,2.2rem)",
            fontWeight: 400,
            color: "var(--text-primary)",
            marginBottom: 44,
          }}
        >
          Four powerful tools.
          <br />
          One research workflow.
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
            gap: 14,
          }}
        >
          {FEATURES.map(({ icon: Icon, bg, ic, title, desc }, i) => (
            <div
              key={title}
              className={`card anim-up d${i + 1}`}
              style={{ padding: 22 }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 13,
                }}
              >
                <Icon size={17} style={{ color: ic }} />
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 7,
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section
        style={{
          background: "var(--bg-raised)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          padding: "72px 24px",
        }}
      >
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <p
            className="label-xs"
            style={{ textAlign: "center", marginBottom: 10 }}
          >
            Pricing
          </p>
          <h2
            style={{
              textAlign: "center",
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.5rem,4vw,2rem)",
              fontWeight: 400,
              marginBottom: 10,
            }}
          >
            Simple. Transparent.
          </h2>
          <p
            style={{
              textAlign: "center",
              fontSize: 13,
              color: "var(--text-secondary)",
              marginBottom: 44,
            }}
          >
            Pay via UPI, card or net banking — powered by Razorpay. No hidden
            fees.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
              gap: 14,
            }}
          >
            {PLANS.map(({ n, p, period, hi, fs, cta, href }) => (
              <div
                key={n}
                className="card"
                style={{
                  padding: 24,
                  background: hi ? "var(--surface)" : "var(--bg-overlay)",
                  borderColor: hi ? "var(--brand-border)" : "var(--border)",
                  borderWidth: hi ? 1.5 : 1,
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform .18s, box-shadow .18s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform =
                    "translateY(-3px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 8px 28px rgba(0,0,0,.4)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = "";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "";
                }}
              >
                {hi && (
                  <div
                    style={{
                      position: "absolute",
                      top: -10,
                      left: "50%",
                      transform: "translateX(-50%)",
                      padding: "2px 12px",
                      borderRadius: 99,
                      background: "var(--brand)",
                      color: "#000",
                      fontSize: 10,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Popular
                  </div>
                )}
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginBottom: 6,
                  }}
                >
                  {n}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 4,
                    marginBottom: 18,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 32,
                      fontWeight: 700,
                      color: hi ? "var(--brand)" : "var(--text-primary)",
                      lineHeight: 1,
                    }}
                  >
                    {p}
                  </span>
                  {period && (
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                      {period}
                    </span>
                  )}
                </div>
                <div className="divider" style={{ marginBottom: 18 }} />
                <ul
                  style={{
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                    flex: 1,
                    marginBottom: 22,
                  }}
                >
                  {fs.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                      }}
                    >
                      <Check
                        size={12}
                        style={{
                          color: hi ? "var(--brand)" : "var(--green)",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "11px 16px",
                    borderRadius: 10,
                    background: hi ? "var(--brand)" : "var(--surface-2)",
                    color: hi ? "#000" : "var(--text-secondary)",
                    border: hi ? "none" : "1px solid var(--border-mid)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                    transition: "all .14s",
                  }}
                >
                  {cta} <ArrowRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <div style={{ padding: "60px 24px", textAlign: "center" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.4rem,4vw,1.9rem)",
            fontWeight: 400,
            marginBottom: 14,
          }}
        >
          Start researching smarter today
        </h2>
        <p
          style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 26 }}
        >
          Free forever. No credit card needed to start.
        </p>
        {session ? (
          <Link
            href="/search"
            className="btn btn-brand"
            style={{
              padding: "11px 26px",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Continue Researching <ArrowRight size={14} />
          </Link>
        ) : (
          <Link
            href="/auth/signin"
            className="btn btn-brand"
            style={{
              padding: "11px 26px",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Get started free <ArrowRight size={14} />
          </Link>
        )}
      </div>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "18px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
          © 2026 Researchly · Made with ❤️ in India 🇮🇳
        </span>
        <div style={{ display: "flex", gap: 14 }}>
          {["Search", "Review", "PDF Chat", "Pricing"].map((l) => (
            <Link
              key={l}
              href={`/${l.toLowerCase().replace(/ /g, "-").replace("pdf-chat", "upload")}`}
              style={{
                fontSize: 11.5,
                color: "var(--text-faint)",
                textDecoration: "none",
              }}
            >
              {l}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
