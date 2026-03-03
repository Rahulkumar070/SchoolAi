"use client";
import { useState, useEffect, useRef } from "react";
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
  Star,
  Shield,
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
    color: "#5c9ae0",
    bg: "rgba(92,154,224,.12)",
    title: "AI Research Search",
    desc: "Ask anything in plain English. Get synthesised answers from 200M+ papers with inline citations.",
    tag: "Most used",
  },
  {
    icon: BookOpen,
    color: "#5db87a",
    bg: "rgba(93,184,122,.12)",
    title: "Literature Reviews",
    desc: "Full structured reviews — intro, methodology, findings, gaps — generated in under 30 seconds.",
    tag: "Student favourite",
  },
  {
    icon: FileText,
    color: "#e8a045",
    bg: "rgba(232,160,69,.12)",
    title: "PDF Chat",
    desc: "Upload any paper. Ask about methods, results, stats. Understands context across 30+ pages.",
    tag: "Pro feature",
  },
  {
    icon: Zap,
    color: "#ad73e0",
    bg: "rgba(173,115,224,.12)",
    title: "Citation Export",
    desc: "APA, MLA, IEEE, Chicago, Vancouver, BibTeX — formatted perfectly, one click download.",
    tag: "All plans",
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
      "Full library access",
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
      "API access (100 req/day)",
      "Team sharing (5 seats)",
      "Priority support",
    ],
    cta: "Subscribe Now",
    href: "/pricing",
  },
];

const TESTIMONIALS = [
  {
    name: "Priya Sharma",
    role: "PhD Student, IIT Delhi",
    text: "Researchly cut my literature review time from 2 weeks to 2 hours. Absolutely incredible tool.",
    avatar: "PS",
  },
  {
    name: "Rahul Verma",
    role: "MSc Biology, AIIMS",
    text: "The PDF chat feature is mind-blowing. I can ask my research papers questions like I'm talking to the author.",
    avatar: "RV",
  },
  {
    name: "Ananya Singh",
    role: "UPSC Aspirant",
    text: "For UPSC prep, the research search with citations is a game changer. Saves so much time.",
    avatar: "AS",
  },
];

function Counter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let start = 0;
      const step = end / 60;
      const t = setInterval(() => {
        start += step;
        if (start >= end) {
          setCount(end);
          clearInterval(t);
        } else setCount(Math.floor(start));
      }, 16);
    });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [end]);
  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

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
                {session.user?.name}
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
            {[
              {
                href: "/dashboard",
                icon: LayoutDashboard,
                label: "My Dashboard",
              },
              { href: "/search", icon: Search, label: "Research Search" },
              { href: "/pricing", icon: Crown, label: "Upgrade Plan" },
            ].map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
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
                <Icon size={13} /> {label}
              </Link>
            ))}
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
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (val: string) => {
    if (val.trim()) router.push(`/search?q=${encodeURIComponent(val.trim())}`);
  };

  return (
    <div
      style={{
        background: "var(--bg)",
        minHeight: "100vh",
        overflowX: "hidden",
      }}
    >
      {/* Background grid */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage: `linear-gradient(rgba(232,160,69,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(232,160,69,.03) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Glow blobs */}
      <div
        style={{
          position: "fixed",
          top: "-20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 800,
          height: 400,
          background:
            "radial-gradient(ellipse, rgba(232,160,69,.07) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "40%",
          left: "-10%",
          width: 500,
          height: 500,
          background:
            "radial-gradient(ellipse, rgba(92,154,224,.04) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "60%",
          right: "-10%",
          width: 500,
          height: 500,
          background:
            "radial-gradient(ellipse, rgba(173,115,224,.04) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Navbar */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: scrolled ? "rgba(10,10,10,.88)" : "transparent",
          backdropFilter: scrolled ? "blur(20px)" : "none",
          borderBottom: scrolled
            ? "1px solid rgba(255,255,255,.06)"
            : "1px solid transparent",
          padding: "0 28px",
          height: 58,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: "all .3s ease",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: "var(--brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BookOpen size={15} color="#000" strokeWidth={2.5} />
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: 15.5,
              color: "var(--text-primary)",
              letterSpacing: "-.4px",
            }}
          >
            Researchly
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {[
            ["Search", "/search"],
            ["Pricing", "/pricing"],
          ].map(([l, h]) => (
            <Link
              key={l}
              href={h}
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                padding: "6px 12px",
                borderRadius: 8,
                textDecoration: "none",
                transition: "all .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)";
                e.currentTarget.style.background = "var(--surface)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              {l}
            </Link>
          ))}
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
              style={{
                padding: "7px 18px",
                borderRadius: 99,
                fontSize: 13,
                fontWeight: 600,
                background: "var(--brand)",
                color: "#000",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = ".85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Get Started <ArrowRight size={12} />
            </Link>
          )}
        </div>
      </nav>

      {/* Welcome banner */}
      {session && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            background:
              "linear-gradient(90deg, rgba(232,160,69,.08), rgba(92,154,224,.08))",
            borderBottom: "1px solid rgba(232,160,69,.15)",
            padding: "10px 28px",
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
                {" "}
                &nbsp;·&nbsp; Free plan active
              </span>
            )}
            {session.user?.plan !== "free" && (
              <span style={{ color: "var(--green)" }}>
                {" "}
                &nbsp;·&nbsp; {session.user?.plan === "pro"
                  ? "Pro"
                  : "Student"}{" "}
                plan active ✨
              </span>
            )}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/search"
              style={{
                padding: "5px 14px",
                borderRadius: 99,
                background: "var(--brand)",
                color: "#000",
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Start Researching →
            </Link>
            <Link
              href="/dashboard"
              style={{
                padding: "5px 14px",
                borderRadius: 99,
                background: "var(--surface)",
                color: "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 500,
                textDecoration: "none",
                border: "1px solid var(--border)",
              }}
            >
              Dashboard
            </Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 820,
          margin: "0 auto",
          padding: "100px 24px 80px",
          textAlign: "center",
        }}
      >
        <div
          className="anim-up"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 14px",
            borderRadius: 99,
            background: "rgba(232,160,69,.1)",
            border: "1px solid rgba(232,160,69,.22)",
            marginBottom: 34,
          }}
        >
          <Sparkles size={11} style={{ color: "var(--brand)" }} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--brand)",
              letterSpacing: ".3px",
            }}
          >
            200M+ papers · Free to start · Made in India 🇮🇳
          </span>
        </div>

        <h1
          className="anim-up d1"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2.8rem,8vw,4.8rem)",
            fontWeight: 400,
            lineHeight: 1.07,
            color: "var(--text-primary)",
            marginBottom: 22,
            letterSpacing: "-2px",
          }}
        >
          Research smarter,
          <br />
          <span
            style={{
              background:
                "linear-gradient(135deg, #e8a045 0%, #f5c878 50%, #e8a045 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontStyle: "italic",
            }}
          >
            not harder.
          </span>
        </h1>

        <p
          className="anim-up d2"
          style={{
            fontSize: 16.5,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            maxWidth: 520,
            margin: "0 auto 48px",
            fontWeight: 400,
          }}
        >
          Search 200M+ academic papers, generate literature reviews, and chat
          with PDFs — powered by Claude AI.
        </p>

        {/* Search bar */}
        <div
          className="anim-up d3"
          style={{ position: "relative", maxWidth: 640, margin: "0 auto 18px" }}
        >
          <div
            style={{
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.1)",
              borderRadius: 18,
              padding: "4px 4px 4px 20px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 20px 60px rgba(0,0,0,.25)",
              transition: "all .2s",
            }}
            onFocusCapture={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor =
                "rgba(232,160,69,.4)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 0 0 4px rgba(232,160,69,.08), 0 20px 60px rgba(0,0,0,.3)";
            }}
            onBlurCapture={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor =
                "rgba(255,255,255,.1)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 20px 60px rgba(0,0,0,.25)";
            }}
          >
            <Search
              size={16}
              style={{ color: "var(--text-faint)", flexShrink: 0 }}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go(q)}
              placeholder="Ask any research question…"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "var(--font-ui)",
                fontSize: 15,
                color: "var(--text-primary)",
                padding: "11px 0",
              }}
            />
            <button
              onClick={() => go(q)}
              disabled={!q.trim()}
              style={{
                padding: "10px 22px",
                borderRadius: 14,
                background: q.trim() ? "var(--brand)" : "var(--surface-2)",
                color: q.trim() ? "#000" : "var(--text-faint)",
                border: "none",
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                fontWeight: 700,
                cursor: q.trim() ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all .15s",
                flexShrink: 0,
              }}
            >
              Search <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* Example chips */}
        <div
          className="anim-up d4"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 7,
          }}
        >
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => go(ex)}
              style={{
                padding: "5px 13px",
                borderRadius: 99,
                fontSize: 12,
                background: "rgba(255,255,255,.03)",
                border: "1px solid rgba(255,255,255,.08)",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                transition: "all .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(232,160,69,.3)";
                e.currentTarget.style.color = "var(--text-primary)";
                e.currentTarget.style.background = "rgba(232,160,69,.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,.08)";
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.background = "rgba(255,255,255,.03)";
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* Stats */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          borderTop: "1px solid rgba(255,255,255,.05)",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          background: "rgba(255,255,255,.018)",
          padding: "32px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 8,
            textAlign: "center",
          }}
        >
          {[
            { val: 200, suffix: "M+", label: "Papers indexed" },
            { val: 6, suffix: "", label: "Citation formats" },
            { val: 15, suffix: "s", label: "Avg answer time" },
            { val: 99, suffix: "%", label: "Uptime SLA" },
          ].map(({ val, suffix, label }) => (
            <div key={label}>
              <p
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "var(--brand)",
                  fontFamily: "var(--font-display)",
                  letterSpacing: "-1px",
                  lineHeight: 1,
                }}
              >
                <Counter end={val} suffix={suffix} />
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-faint)",
                  marginTop: 6,
                }}
              >
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 980,
          margin: "0 auto",
          padding: "96px 24px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--brand)",
              marginBottom: 14,
            }}
          >
            Features
          </p>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.8rem,4vw,2.8rem)",
              fontWeight: 400,
              color: "var(--text-primary)",
              lineHeight: 1.12,
              letterSpacing: "-1.5px",
            }}
          >
            Four powerful tools.
            <br />
            One research workflow.
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 16,
          }}
        >
          {FEATURES.map(({ icon: Icon, color, bg, title, desc, tag }, i) => (
            <div
              key={title}
              className={`anim-up d${i + 1}`}
              style={{
                padding: 26,
                borderRadius: 18,
                background: "rgba(255,255,255,.02)",
                border: "1px solid rgba(255,255,255,.06)",
                transition: "all .22s",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = "rgba(255,255,255,.04)";
                el.style.borderColor = `${color}35`;
                el.style.transform = "translateY(-5px)";
                el.style.boxShadow = `0 24px 48px rgba(0,0,0,.35), 0 0 0 1px ${color}18`;
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = "rgba(255,255,255,.02)";
                el.style.borderColor = "rgba(255,255,255,.06)";
                el.style.transform = "";
                el.style.boxShadow = "";
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={19} style={{ color }} />
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color,
                    background: bg,
                    padding: "3px 9px",
                    borderRadius: 99,
                    letterSpacing: ".3px",
                  }}
                >
                  {tag}
                </span>
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 15.5,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 9,
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.68,
                }}
              >
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          background: "rgba(255,255,255,.015)",
          borderTop: "1px solid rgba(255,255,255,.05)",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          padding: "88px 24px",
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--brand)",
                marginBottom: 14,
              }}
            >
              Testimonials
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.6rem,4vw,2.4rem)",
                fontWeight: 400,
                color: "var(--text-primary)",
                letterSpacing: "-1px",
              }}
            >
              Loved by Indian researchers
            </h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))",
              gap: 16,
            }}
          >
            {TESTIMONIALS.map(({ name, role, text, avatar }) => (
              <div
                key={name}
                style={{
                  padding: 26,
                  borderRadius: 18,
                  background: "rgba(255,255,255,.02)",
                  border: "1px solid rgba(255,255,255,.06)",
                  transition: "all .2s",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(232,160,69,.2)";
                  el.style.transform = "translateY(-3px)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(255,255,255,.06)";
                  el.style.transform = "";
                }}
              >
                <div style={{ display: "flex", gap: 3, marginBottom: 16 }}>
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={13}
                      style={{ color: "var(--brand)", fill: "var(--brand)" }}
                    />
                  ))}
                </div>
                <p
                  style={{
                    fontSize: 13.5,
                    color: "var(--text-secondary)",
                    lineHeight: 1.72,
                    marginBottom: 20,
                    fontStyle: "italic",
                  }}
                >
                  "{text}"
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, var(--brand), #5c9ae0)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#000",
                      flexShrink: 0,
                    }}
                  >
                    {avatar}
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {name}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--text-faint)",
                        marginTop: 2,
                      }}
                    >
                      {role}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 920,
          margin: "0 auto",
          padding: "96px 24px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--brand)",
              marginBottom: 14,
            }}
          >
            Pricing
          </p>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.8rem,4vw,2.6rem)",
              fontWeight: 400,
              color: "var(--text-primary)",
              letterSpacing: "-1.5px",
              marginBottom: 12,
            }}
          >
            Simple. Transparent. Fair.
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Pay via UPI, card or net banking · No hidden fees · Cancel anytime
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: 16,
          }}
        >
          {PLANS.map(({ n, p, period, hi, fs, cta, href }) => (
            <div
              key={n}
              style={{
                padding: 30,
                borderRadius: 20,
                background: hi
                  ? "rgba(232,160,69,.05)"
                  : "rgba(255,255,255,.02)",
                border: hi
                  ? "1px solid rgba(232,160,69,.28)"
                  : "1px solid rgba(255,255,255,.06)",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                transition: "transform .2s, box-shadow .2s",
                boxShadow: hi ? "0 0 50px rgba(232,160,69,.09)" : "none",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = "translateY(-5px)";
                el.style.boxShadow = "0 28px 56px rgba(0,0,0,.45)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = "";
                el.style.boxShadow = hi
                  ? "0 0 50px rgba(232,160,69,.09)"
                  : "none";
              }}
            >
              {hi && (
                <div
                  style={{
                    position: "absolute",
                    top: -13,
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "3px 16px",
                    borderRadius: 99,
                    background: "var(--brand)",
                    color: "#000",
                    fontSize: 11,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  ⭐ Most Popular
                </div>
              )}
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  marginBottom: 10,
                }}
              >
                {n}
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 5,
                  marginBottom: 22,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 42,
                    fontWeight: 700,
                    color: hi ? "var(--brand)" : "var(--text-primary)",
                    lineHeight: 1,
                    letterSpacing: "-2px",
                  }}
                >
                  {p}
                </span>
                {period && (
                  <span style={{ fontSize: 13, color: "var(--text-faint)" }}>
                    {period}
                  </span>
                )}
              </div>
              <div
                style={{
                  height: 1,
                  background: "rgba(255,255,255,.06)",
                  marginBottom: 22,
                }}
              />
              <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 11,
                  flex: 1,
                  marginBottom: 26,
                }}
              >
                {fs.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      fontSize: 13.5,
                      color: "var(--text-secondary)",
                      lineHeight: 1.4,
                    }}
                  >
                    <Check
                      size={13}
                      style={{
                        color: hi ? "var(--brand)" : "var(--green)",
                        flexShrink: 0,
                        marginTop: 1,
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
                  padding: "13px 16px",
                  borderRadius: 12,
                  background: hi ? "var(--brand)" : "rgba(255,255,255,.05)",
                  color: hi ? "#000" : "var(--text-secondary)",
                  border: hi ? "none" : "1px solid rgba(255,255,255,.1)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  transition: "opacity .15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = ".85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                {cta} <ArrowRight size={13} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          padding: "40px 24px 96px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: 580,
            margin: "0 auto",
            padding: "64px 44px",
            borderRadius: 28,
            background: "rgba(232,160,69,.04)",
            border: "1px solid rgba(232,160,69,.14)",
            boxShadow: "0 0 100px rgba(232,160,69,.07)",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "var(--brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 22px",
            }}
          >
            <BookOpen size={24} color="#000" />
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.6rem,4vw,2.3rem)",
              fontWeight: 400,
              color: "var(--text-primary)",
              letterSpacing: "-1px",
              marginBottom: 14,
            }}
          >
            Start researching smarter today
          </h2>
          <p
            style={{
              fontSize: 14.5,
              color: "var(--text-muted)",
              marginBottom: 36,
              lineHeight: 1.65,
            }}
          >
            Free forever. No credit card needed.
            <br />
            Join thousands of Indian students and researchers.
          </p>
          <Link
            href={session ? "/search" : "/auth/signin"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 32px",
              borderRadius: 99,
              background: "var(--brand)",
              color: "#000",
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
              transition: "opacity .15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = ".85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {session ? "Continue Researching" : "Get started free"}{" "}
            <ArrowRight size={15} />
          </Link>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-faint)",
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <Shield size={11} /> Secured by Razorpay · Cancel anytime ·
            hello.researchly@gmail.com
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          position: "relative",
          zIndex: 1,
          borderTop: "1px solid rgba(255,255,255,.05)",
          padding: "22px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            © 2026 Researchly · Built by{" "}
            <strong style={{ color: "var(--text-secondary)" }}>
              Rahulkumar Pal
            </strong>{" "}
            · Made with ❤️ in India 🇮🇳
          </span>
          <a
            href="mailto:hello.researchly@gmail.com"
            style={{
              fontSize: 11,
              color: "var(--brand)",
              textDecoration: "none",
            }}
          >
            hello.researchly@gmail.com
          </a>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          {[
            ["Search", "/search"],
            ["Review", "/review"],
            ["PDF Chat", "/upload"],
            ["Pricing", "/pricing"],
          ].map(([l, h]) => (
            <Link
              key={l}
              href={h}
              style={{
                fontSize: 12,
                color: "var(--text-faint)",
                textDecoration: "none",
                transition: "color .15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--text-secondary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--text-faint)")
              }
            >
              {l}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
