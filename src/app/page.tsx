"use client";
import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import {
  Search,
  BookOpen,
  FileText,
  BookMarked,
  ArrowRight,
  Check,
  Sparkles,
  Crown,
  Zap,
  LogOut,
  LayoutDashboard,
  ChevronDown,
  Twitter,
  Github,
  Linkedin,
  Menu,
  X,
  FlaskConical,
  Star,
  ChevronRight,
  GraduationCap,
} from "lucide-react";
import "./landing.css";

/* ─── Scroll Reveal ────────────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const run = () => {
      const els = document.querySelectorAll<HTMLElement>(".sr");
      const obs = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              obs.unobserve(e.target);
            }
          }),
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
      );
      els.forEach((el) => obs.observe(el));
      return () => obs.disconnect();
    };
    const cleanup = run();
    return cleanup;
  }, []);
}

/* ─── Animated Counter ─────────────────────────────────────── */
function AnimCounter({
  to,
  suffix = "",
  prefix = "",
}: {
  to: number;
  suffix?: string;
  prefix?: string;
}) {
  const [val, setVal] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStarted(true);
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    if (!started) return;
    let raf: number;
    let start = 0;
    const dur = 1600;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [started, to]);
  return (
    <span ref={ref}>
      {prefix}
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ─── Typing Hero Text ─────────────────────────────────────── */
const QUERIES = [
  "How does gut microbiome affect mental health?",
  "CRISPR gene editing in cancer therapy",
  "RLHF techniques for LLM alignment",
  "Long COVID neurological mechanisms",
  "Quantum error correction breakthroughs",
];
function TypingText() {
  const [qi, setQi] = useState(0);
  const [text, setText] = useState("");
  const [del, setDel] = useState(false);
  useEffect(() => {
    const full = QUERIES[qi];
    let t: ReturnType<typeof setTimeout>;
    if (!del && text.length < full.length)
      t = setTimeout(() => setText(full.slice(0, text.length + 1)), 38);
    else if (!del && text.length === full.length)
      t = setTimeout(() => setDel(true), 1800);
    else if (del && text.length > 0)
      t = setTimeout(() => setText(text.slice(0, -1)), 18);
    else {
      setDel(false);
      setQi((q) => (q + 1) % QUERIES.length);
    }
    return () => clearTimeout(t);
  }, [text, del, qi]);
  return (
    <span>
      {text}
      <span className="lp-cursor" />
    </span>
  );
}

/* ─── User Menu ────────────────────────────────────────────── */
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
  const planColor =
    plan === "pro" ? "#5b99df" : plan === "student" ? "#e8a045" : "#555";
  const planLabel =
    plan === "pro" ? "Pro" : plan === "student" ? "Student" : "Free";
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 12px 5px 6px",
          borderRadius: 99,
          background: "rgba(255,255,255,.07)",
          border: "1px solid rgba(255,255,255,.1)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {session.user?.image ? (
          <Image
            src={session.user.image}
            alt="av"
            width={26}
            height={26}
            style={{ borderRadius: "50%" }}
          />
        ) : (
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "#e8a045",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#000",
            }}
          >
            {(session.user?.name?.[0] ?? "U").toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: 13.5, color: "#e8e8e8", fontWeight: 600 }}>
          {session.user?.name?.split(" ")[0] ?? "User"}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: planColor,
            background: `${planColor}20`,
            padding: "1px 8px",
            borderRadius: 99,
          }}
        >
          {planLabel}
        </span>
        <ChevronDown size={12} style={{ color: "#555" }} />
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
              top: "calc(100% + 8px)",
              right: 0,
              minWidth: 210,
              background: "#111",
              border: "1px solid rgba(255,255,255,.1)",
              borderRadius: 14,
              padding: 8,
              zIndex: 50,
              boxShadow: "0 20px 60px rgba(0,0,0,.7)",
            }}
          >
            <div
              style={{
                padding: "8px 10px 10px",
                borderBottom: "1px solid rgba(255,255,255,.06)",
                marginBottom: 6,
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: "#ececec" }}>
                {session.user?.name}
              </p>
              <p style={{ fontSize: 11, color: "#444", marginTop: 2 }}>
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
                  fontSize: 13.5,
                  color: "#888",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,.06)";
                  e.currentTarget.style.color = "#e8e8e8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#888";
                }}
              >
                <Icon size={13} /> {label}
              </Link>
            ))}
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,.06)",
                marginTop: 6,
                paddingTop: 6,
              }}
            >
              <button
                onClick={() => void signOut()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 8,
                  fontSize: 13.5,
                  color: "#e05c5c",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(224,92,92,.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
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

/* ════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [yearly, setYearly] = useState(false);

  useScrollReveal();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  /* ── DATA ── */
  const FEATURES = [
    {
      icon: Search,
      color: "#5b99df",
      bg: "rgba(91,153,223,.12)",
      tag: "200M+ Papers",
      tagC: "#5b99df",
      tagBg: "rgba(91,153,223,.12)",
      title: "AI Research Search",
      desc: "Ask anything in plain English. Get synthesised answers with every claim cited from peer-reviewed sources. No hallucinations — only evidence.",
    },
    {
      icon: BookOpen,
      color: "#52c97a",
      bg: "rgba(82,201,122,.12)",
      tag: "< 30 seconds",
      tagC: "#52c97a",
      tagBg: "rgba(82,201,122,.12)",
      title: "Literature Review Generator",
      desc: "Full structured reviews — introduction, methodology, findings, research gaps — formatted for submission in under 30 seconds.",
    },
    {
      icon: FileText,
      color: "#e8a045",
      bg: "rgba(232,160,69,.12)",
      tag: "Any PDF",
      tagC: "#e8a045",
      tagBg: "rgba(232,160,69,.12)",
      title: "PDF Chat",
      desc: "Upload any research paper. Ask about methods, results, statistics, limitations. AI understands full context across 30+ pages simultaneously.",
    },
    {
      icon: BookMarked,
      color: "#b07ef0",
      bg: "rgba(176,126,240,.12)",
      tag: "6 Formats",
      tagC: "#b07ef0",
      tagBg: "rgba(176,126,240,.12)",
      title: "Research Library",
      desc: "Save papers, export citations in APA, MLA, IEEE, Chicago, Vancouver, BibTeX. Your entire research — organized, searchable, downloadable.",
    },
  ];

  const STEPS = [
    {
      n: "01",
      icon: Search,
      color: "#5b99df",
      title: "Search",
      desc: "Type any research question in plain English. Our AI scans 200M+ papers across Semantic Scholar, OpenAlex, and arXiv in seconds.",
    },
    {
      n: "02",
      icon: FlaskConical,
      color: "#e8a045",
      title: "Analyse",
      desc: "Get a synthesised answer with inline citations, key takeaways, methodology breakdown, and direct links to source papers.",
    },
    {
      n: "03",
      icon: BookOpen,
      color: "#52c97a",
      title: "Write",
      desc: "Generate full literature reviews, export citations in any format, download PDFs — all in one seamless workflow.",
    },
  ];

  const TESTIMONIALS = [
    {
      name: "Priya Sharma",
      role: "PhD Candidate, IIT Bombay",
      av: "PS",
      avBg: "#5b99df",
      plan: "Pro",
      planC: "#5b99df",
      text: "Researchly cut my literature review time from 3 days to 2 hours. The citation quality is remarkable — it finds the right papers every single time.",
    },
    {
      name: "Arjun Mehta",
      role: "UPSC 2024 — AIR 87",
      av: "AM",
      avBg: "#52c97a",
      plan: "Student",
      planC: "#e8a045",
      text: "I use it daily for current affairs and essay writing. The AI understands exactly what a civil services answer needs. Absolute game changer.",
    },
    {
      name: "Dr. Kavya Nair",
      role: "Research Scientist, DRDO",
      av: "KN",
      avBg: "#b07ef0",
      plan: "Pro",
      planC: "#5b99df",
      text: "The PDF chat feature is unprecedented. I can query a 50-page technical report and get precise, contextual answers in seconds.",
    },
    {
      name: "Rohan Verma",
      role: "MSc CS, IISc Bangalore",
      av: "RV",
      avBg: "#e8a045",
      plan: "Student",
      planC: "#e8a045",
      text: "My supervisor couldn't believe I drafted the related work section in one afternoon. The literature review quality is publication-ready.",
    },
    {
      name: "Aisha Patel",
      role: "JEE Advanced 2024 — AIR 312",
      av: "AP",
      avBg: "#52c97a",
      plan: "Free",
      planC: "#777",
      text: "Every concept I didn't understand, I searched on Researchly. Better than any coaching material. Got into IIT Bombay!",
    },
    {
      name: "Siddharth Rao",
      role: "Biomedical Researcher, AIIMS",
      av: "SR",
      avBg: "#e05c5c",
      plan: "Pro",
      planC: "#5b99df",
      text: "Clinical research requires precision. Researchly delivers — accurate citations, correct journals, and medically sound explanations.",
    },
  ];

  const PLANS = [
    {
      name: "Free",
      desc: "Perfect to get started",
      price: "₹0",
      period: "",
      highlight: false,
      badge: null,
      color: "#555",
      cta: "Start Free",
      ctaStyle: "outline" as const,
      href: "/auth/signin",
      features: [
        "5 AI searches per day",
        "Cited answers from 200M+ papers",
        "APA & MLA citations",
        "Save 20 papers",
        "1 PDF upload/month",
      ],
    },
    {
      name: "Student",
      desc: "For students & researchers",
      price: yearly ? "₹1,590" : "₹199",
      period: yearly ? "/year" : "/month",
      highlight: true,
      badge: "Most Popular",
      color: "#e8a045",
      cta: "Get Student Plan",
      ctaStyle: "primary" as const,
      href: "/pricing",
      features: [
        "500 searches per month",
        "Full literature review generator",
        "All 6 citation formats",
        "20 PDF uploads/month",
        "Full research library",
        "Priority AI responses",
      ],
    },
    {
      name: "Pro",
      desc: "For teams and heavy users",
      price: yearly ? "₹3,990" : "₹499",
      period: yearly ? "/year" : "/month",
      highlight: false,
      badge: null,
      color: "#5b99df",
      cta: "Get Pro",
      ctaStyle: "outline" as const,
      href: "/pricing",
      features: [
        "Unlimited searches",
        "Unlimited PDF uploads",
        "Fastest AI model",
        "API access",
        "Team sharing (5 seats)",
        "Priority support & SLA",
      ],
    },
  ];

  const UNIS = [
    "IIT Bombay",
    "IISc Bangalore",
    "AIIMS Delhi",
    "Delhi University",
    "BITS Pilani",
    "VIT Vellore",
    "NIT Trichy",
    "TIFR Mumbai",
    "Jadavpur University",
    "Anna University",
    "Semantic Scholar",
    "OpenAlex",
  ];

  return (
    <div className="lp">
      {/* ── NAV ── */}
      <nav className={`lp-nav${scrolled ? " scrolled" : ""}`}>
        <div className="lp-nav-inner">
          <Link href="/" className="lp-logo">
            <div className="lp-logo-mark">
              <BookOpen size={15} color="#000" strokeWidth={2.5} />
            </div>
            Researchly
          </Link>
          <div className="lp-nav-links">
            {[
              ["#features", "Features"],
              ["#how-it-works", "How It Works"],
              ["#pricing", "Pricing"],
              ["#testimonials", "Reviews"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="lp-navlink">
                {label}
              </a>
            ))}
          </div>
          <div className="lp-nav-actions">
            {session ? (
              <UserMenu session={session} />
            ) : (
              <>
                <Link href="/auth/signin" className="lp-navlink">
                  Sign in
                </Link>
                <Link href="/auth/signin" className="lp-btn-primary lp-btn-sm">
                  Start Free <ArrowRight size={13} />
                </Link>
              </>
            )}
            <button
              onClick={() => setMobileOpen(true)}
              style={{ display: "none" }}
              className="lp-ham"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lp-mobile-menu">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 36,
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f0" }}>
              Researchly
            </span>
            <button
              onClick={() => setMobileOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#e8e8e8",
                cursor: "pointer",
              }}
            >
              <X size={24} />
            </button>
          </div>
          {[
            ["#features", "Features"],
            ["#how-it-works", "How It Works"],
            ["#pricing", "Pricing"],
            ["#testimonials", "Reviews"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className="lp-mobile-nav-link"
            >
              {label}
            </a>
          ))}
          <div
            style={{
              marginTop: 40,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <Link
              href="/auth/signin"
              className="lp-btn-primary"
              style={{ justifyContent: "center" }}
            >
              Start Researching Free
            </Link>
            <Link
              href="/auth/signin"
              className="lp-btn-ghost"
              style={{ justifyContent: "center" }}
            >
              Sign In
            </Link>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════
          1. HERO
      ════════════════════════════════════ */}
      <section className="lp-hero">
        {/* Background orbs */}
        <div
          className="lp-orb"
          style={{
            width: 800,
            height: 800,
            background:
              "radial-gradient(circle, rgba(232,160,69,.2) 0%, transparent 65%)",
            top: "-200px",
            right: "-100px",
          }}
        />
        <div
          className="lp-orb"
          style={{
            width: 600,
            height: 600,
            background:
              "radial-gradient(circle, rgba(91,153,223,.14) 0%, transparent 65%)",
            bottom: "-100px",
            left: "-80px",
            animationDelay: "-7s",
            animationDuration: "25s",
          }}
        />
        <div
          className="lp-orb"
          style={{
            width: 400,
            height: 400,
            background:
              "radial-gradient(circle, rgba(176,126,240,.1) 0%, transparent 65%)",
            top: "40%",
            left: "35%",
            animationDelay: "-14s",
            animationDuration: "18s",
          }}
        />

        <div className="lp-hero-grid">
          {/* Left: copy */}
          <div>
            <div className="lp-badge sr up">
              <Sparkles size={12} /> Trusted by 10,000+ researchers across India
            </div>
            <h1 className="lp-hero-title sr up sr-d1">
              Research smarter.
              <br />
              <span className="grad">Write faster.</span>
              <br />
              Cite perfectly.
            </h1>
            <p className="lp-hero-sub sr up sr-d2">
              AI-powered academic search across 200M+ papers. Generate
              literature reviews, chat with PDFs, export any citation format —
              in seconds.
            </p>
            <div className="lp-hero-actions sr up sr-d3">
              <Link href="/auth/signin" className="lp-btn-primary">
                Start Researching Free <ArrowRight size={14} />
              </Link>
              <Link href="#demo" className="lp-btn-ghost">
                See How It Works
              </Link>
            </div>
            <p className="lp-hero-note sr up sr-d4">
              Free forever · No credit card · Google or GitHub login
            </p>

            {/* Social proof */}
            <div
              className="sr up sr-d5"
              style={{
                marginTop: 36,
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div style={{ display: "flex" }}>
                {["#5b99df", "#52c97a", "#e8a045", "#b07ef0", "#e05c5c"].map(
                  (c, i) => (
                    <div
                      key={i}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: c,
                        border: "2px solid #070707",
                        marginLeft: i > 0 ? -8 : 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#000",
                        position: "relative",
                        zIndex: 5 - i,
                      }}
                    >
                      {["P", "A", "R", "K", "S"][i]}
                    </div>
                  ),
                )}
              </div>
              <div>
                <div style={{ display: "flex", gap: 2, marginBottom: 3 }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} size={11} fill="#e8a045" color="#e8a045" />
                  ))}
                </div>
                <p style={{ fontSize: 12.5, color: "#555" }}>
                  Loved by <strong style={{ color: "#999" }}>10,000+</strong>{" "}
                  students & researchers
                </p>
              </div>
            </div>
          </div>

          {/* Right: UI mockup */}
          <div
            className="lp-hero-visual sr scale sr-d3"
            style={{ position: "relative" }}
          >
            <div className="lp-ui-window lp-float-a">
              <div className="lp-ui-titlebar">
                <div className="lp-ui-dot" style={{ background: "#ff5f57" }} />
                <div className="lp-ui-dot" style={{ background: "#febc2e" }} />
                <div className="lp-ui-dot" style={{ background: "#28c840" }} />
                <div
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: 11,
                    color: "#444",
                    fontFamily: "monospace",
                  }}
                >
                  researchly.in/search
                </div>
              </div>
              <div style={{ padding: "20px" }}>
                <div
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(232,160,69,.3)",
                    borderRadius: 10,
                    padding: "11px 15px",
                    marginBottom: 18,
                    fontSize: 13.5,
                    color: "#e8e8e8",
                    boxShadow: "0 0 0 3px rgba(232,160,69,.07)",
                  }}
                >
                  <TypingText />
                </div>
                {[
                  { w: "100%", h: 10, mb: 9 },
                  { w: "88%", h: 10, mb: 9 },
                  { w: "70%", h: 10, mb: 20 },
                ].map((r, i) => (
                  <div
                    key={i}
                    className="lp-shimmer"
                    style={{
                      width: r.w,
                      height: r.h,
                      marginBottom: r.mb,
                      borderRadius: 5,
                    }}
                  />
                ))}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["[1] Nature 2023", "[2] Cell 2022", "[3] PNAS 2024"].map(
                    (c) => (
                      <span
                        key={c}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 99,
                          background: "rgba(91,153,223,.12)",
                          border: "1px solid rgba(91,153,223,.2)",
                          fontSize: 11,
                          color: "#5b99df",
                          fontWeight: 600,
                        }}
                      >
                        {c}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>
            <div
              className="lp-chip lp-float-b"
              style={{ position: "absolute", bottom: -20, left: -40 }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#52c97a",
                }}
              />
              18 sources found
            </div>
            <div
              className="lp-chip lp-float-c"
              style={{ position: "absolute", top: 60, right: -50 }}
            >
              <Zap size={12} color="#e8a045" /> Answer in 1.4s
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════
          2. TRUST
      ════════════════════════════════════ */}
      <div className="lp-trust">
        <p className="lp-trust-label">
          Used by students at India&apos;s top institutions
        </p>
        <div className="lp-trust-track-wrap">
          <div className="lp-trust-track">
            {[...UNIS, ...UNIS].map((u, i) => (
              <div key={i} className="lp-trust-item">
                <GraduationCapIcon /> {u}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lp-divider" />

      {/* Stats */}
      <section
        style={{ padding: "80px 28px", position: "relative", zIndex: 1 }}
      >
        <div className="lp-inner">
          <div className="lp-stats-grid sr up">
            {[
              { val: 200, suffix: "M+", label: "Academic Papers Indexed" },
              { val: 10000, suffix: "+", label: "Active Researchers" },
              { val: 14, suffix: "s", label: "Avg Response Time (1.4s)" },
              { val: 30, suffix: "+", label: "Universities Represented" },
            ].map((s, i) => (
              <div key={i} className="lp-stat">
                <div className="lp-stat-val">
                  <AnimCounter to={s.val} suffix={s.suffix} />
                </div>
                <div className="lp-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════
          3. FEATURES
      ════════════════════════════════════ */}
      <section id="features" className="lp-section">
        <div className="lp-inner">
          <div className="lp-text-center" style={{ marginBottom: 56 }}>
            <div className="lp-label sr up">Capabilities</div>
            <h2 className="lp-heading sr up sr-d1">
              Everything you need to
              <br />
              <em>research like a PhD</em>
            </h2>
            <p
              className="lp-sub lp-sub-center sr up sr-d2"
              style={{ textAlign: "center" }}
            >
              Four powerful AI tools, one unified research workspace.
            </p>
          </div>
          <div className="lp-features-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className={`lp-feat-card sr up sr-d${i + 1}`}>
                <div className="lp-feat-glow" style={{ background: f.color }} />
                <div className="lp-feat-icon" style={{ background: f.bg }}>
                  <f.icon size={22} color={f.color} />
                </div>
                <span
                  className="lp-feat-tag"
                  style={{ background: f.tagBg, color: f.tagC }}
                >
                  {f.tag}
                </span>
                <h3 className="lp-feat-title">{f.title}</h3>
                <p className="lp-feat-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════
          4. PRODUCT DEMO
      ════════════════════════════════════ */}
      <section
        id="demo"
        className="lp-section lp-demo"
        style={{ paddingTop: 40 }}
      >
        <div className="lp-inner">
          <div className="lp-label sr up">Product Preview</div>
          <h2 className="lp-heading sr up sr-d1">See it in action</h2>
          <p
            className="lp-sub lp-sub-center sr up sr-d2"
            style={{ textAlign: "center", marginBottom: 52 }}
          >
            A research workflow so fast, it feels like cheating.
          </p>
          <div className="lp-demo-frame sr scale sr-d2">
            <div className="lp-demo-bar">
              <div style={{ display: "flex", gap: 6 }}>
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <div
                    key={c}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: c,
                    }}
                  />
                ))}
              </div>
              <div className="lp-demo-url">researchly.in/search</div>
            </div>
            <div className="lp-demo-content">
              <div
                style={{
                  padding: "22px 28px",
                  borderBottom: "1px solid rgba(255,255,255,.04)",
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(232,160,69,.22)",
                    borderRadius: 12,
                    padding: "12px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Search size={16} color="#e8a045" />
                  <span style={{ fontSize: 14, color: "#888" }}>
                    How does neuroplasticity affect learning and memory
                    formation?
                  </span>
                </div>
              </div>
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 280px" }}
              >
                <div
                  style={{
                    padding: "24px 28px",
                    borderRight: "1px solid rgba(255,255,255,.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 18,
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: "rgba(232,160,69,.12)",
                        border: "1px solid rgba(232,160,69,.22)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <BookOpen size={13} color="#e8a045" />
                    </div>
                    <span style={{ fontSize: 13, color: "#555" }}>
                      Researchly AI · 18 sources
                    </span>
                  </div>
                  {[
                    { w: "100%", t: true },
                    { w: "95%", t: false },
                    { w: "88%", t: false },
                    { w: "72%", t: false },
                    { w: "0", gap: 16 },
                    { w: "100%", t: true },
                    { w: "92%", t: false },
                    { w: "60%", t: false },
                  ].map((l, i) =>
                    (l as any).gap ? (
                      <div key={i} style={{ height: (l as any).gap }} />
                    ) : (
                      <div
                        key={i}
                        className="lp-shimmer"
                        style={{
                          width: l.w,
                          height: (l as any).t ? 12 : 9,
                          marginBottom: 9,
                          borderRadius: 5,
                          opacity: (l as any).t ? 0.9 : 0.5,
                        }}
                      />
                    ),
                  )}
                  <div style={{ display: "flex", gap: 7, marginTop: 18 }}>
                    {[
                      "[1] Neuron 2023",
                      "[2] Nature Neuro 2022",
                      "[3] Science 2024",
                    ].map((c) => (
                      <span
                        key={c}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 99,
                          background: "rgba(91,153,223,.1)",
                          border: "1px solid rgba(91,153,223,.2)",
                          fontSize: 11,
                          color: "#5b99df",
                          fontWeight: 600,
                        }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "18px 16px" }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#444",
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      marginBottom: 14,
                    }}
                  >
                    Sources
                  </p>
                  {[
                    {
                      title: "Synaptic plasticity and memory",
                      journal: "Nature Neuroscience · 2023",
                    },
                    {
                      title: "BDNF in hippocampal learning",
                      journal: "Neuron · 2023",
                    },
                    {
                      title: "LTP mechanisms review",
                      journal: "Science · 2024",
                    },
                  ].map((p, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 12px",
                        background: "rgba(255,255,255,.03)",
                        border: "1px solid rgba(255,255,255,.06)",
                        borderRadius: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#ccc",
                          fontWeight: 600,
                          marginBottom: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        {p.title}
                      </div>
                      <div style={{ fontSize: 10.5, color: "#555" }}>
                        {p.journal}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════
          5. HOW IT WORKS
      ════════════════════════════════════ */}
      <section id="how-it-works" className="lp-section">
        <div className="lp-inner">
          <div className="lp-text-center" style={{ marginBottom: 56 }}>
            <div className="lp-label sr up">Process</div>
            <h2 className="lp-heading sr up sr-d1">
              From question to
              <br />
              <em>publication-ready</em> in minutes
            </h2>
          </div>
          <div className="lp-steps-grid">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={`lp-step-card sr up sr-d${i + 1}`}
                style={{ position: "relative" }}
              >
                <span className="lp-step-num">{s.n}</span>
                <div className="lp-step-icon">
                  <s.icon size={22} color={s.color} />
                </div>
                <h3 className="lp-step-title">{s.title}</h3>
                <p className="lp-step-desc">{s.desc}</p>
                {i < STEPS.length - 1 && (
                  <div className="lp-step-connector">
                    <ChevronRight size={14} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════
          6. TESTIMONIALS
      ════════════════════════════════════ */}
      <section
        id="testimonials"
        className="lp-section"
        style={{ paddingTop: 40 }}
      >
        <div className="lp-inner">
          <div className="lp-text-center" style={{ marginBottom: 56 }}>
            <div className="lp-label sr up">Social Proof</div>
            <h2 className="lp-heading sr up sr-d1">
              Researchers love it.
              <br />
              <em>Results prove it.</em>
            </h2>
          </div>
          <div className="lp-testi-grid">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className={`lp-testi-card sr up sr-d${(i % 3) + 1}`}>
                <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
                  {[1, 2, 3, 4, 5].map((j) => (
                    <Star key={j} size={12} fill="#e8a045" color="#e8a045" />
                  ))}
                </div>
                <p className="lp-testi-quote">&ldquo;{t.text}&rdquo;</p>
                <div className="lp-testi-author">
                  <div className="lp-testi-av" style={{ background: t.avBg }}>
                    {t.av}
                  </div>
                  <div>
                    <p className="lp-testi-name">{t.name}</p>
                    <p className="lp-testi-role">{t.role}</p>
                  </div>
                  <span
                    className="lp-testi-plan"
                    style={{
                      background: `${t.planC}18`,
                      color: t.planC,
                      border: `1px solid ${t.planC}30`,
                    }}
                  >
                    {t.plan}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════
          7. PRICING
      ════════════════════════════════════ */}
      <section id="pricing" className="lp-section">
        <div className="lp-inner">
          <div className="lp-text-center" style={{ marginBottom: 20 }}>
            <div className="lp-label sr up">Pricing</div>
            <h2 className="lp-heading sr up sr-d1">
              Simple, honest pricing.
              <br />
              <em>No surprises.</em>
            </h2>
            <p
              className="lp-sub lp-sub-center sr up sr-d2"
              style={{ textAlign: "center" }}
            >
              Start free. Upgrade when you&apos;re ready. Cancel anytime.
            </p>
          </div>
          <div className="lp-pricing-toggle sr up sr-d2">
            <span className={`lp-toggle-label${!yearly ? " active" : ""}`}>
              Monthly
            </span>
            <button
              className={`lp-toggle-pill${yearly ? " on" : ""}`}
              onClick={() => setYearly((y) => !y)}
            >
              <div className="lp-toggle-thumb" />
            </button>
            <span className={`lp-toggle-label${yearly ? " active" : ""}`}>
              Yearly
            </span>
            {yearly && <span className="lp-save-badge">Save 33%</span>}
          </div>
          <div className="lp-plans-grid sr up sr-d3">
            {PLANS.map((p, i) => (
              <div
                key={i}
                className={`lp-plan-card${p.highlight ? " hi" : ""}`}
              >
                {p.badge && (
                  <div className="lp-plan-badge">
                    <Sparkles size={10} /> {p.badge}
                  </div>
                )}
                <h3 className="lp-plan-name">{p.name}</h3>
                <p className="lp-plan-desc">{p.desc}</p>
                <div className="lp-plan-price">
                  <span className="lp-plan-amount">{p.price}</span>
                  <span className="lp-plan-period">{p.period}</span>
                </div>
                <div className="lp-plan-divider" />
                <ul className="lp-plan-features">
                  {p.features.map((f, j) => (
                    <li key={j} className="lp-plan-feature">
                      <Check
                        size={15}
                        color={p.highlight ? "#e8a045" : "#52c97a"}
                        className="lp-plan-check"
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={p.href} className={`lp-plan-cta ${p.ctaStyle}`}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
          <p
            className="sr up"
            style={{
              textAlign: "center",
              marginTop: 28,
              fontSize: 13,
              color: "#3a3a3a",
            }}
          >
            All plans include 14-day money-back guarantee · Secure payment via
            Razorpay
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════
          8. FINAL CTA
      ════════════════════════════════════ */}
      <section className="lp-cta-section">
        <div className="lp-cta-bg" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="lp-label" style={{ justifyContent: "center" }}>
            Get Started Today
          </div>
          <h2 className="lp-cta-title sr up">
            Your research,
            <br />
            <em>accelerated.</em>
          </h2>
          <p className="lp-cta-sub sr up sr-d1">
            Join 10,000+ students and researchers who have made Researchly their
            go-to research tool.
          </p>
          <div
            className="sr up sr-d2"
            style={{
              display: "flex",
              gap: 14,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/auth/signin"
              className="lp-btn-primary"
              style={{ padding: "14px 28px", fontSize: 15 }}
            >
              Start Researching Free <ArrowRight size={16} />
            </Link>
            <Link
              href="/pricing"
              className="lp-btn-ghost"
              style={{ padding: "14px 24px", fontSize: 15 }}
            >
              View Pricing
            </Link>
          </div>
          <p className="lp-cta-note sr up sr-d3">
            Free forever · No credit card required · Google or GitHub login
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════
          9. FOOTER
      ════════════════════════════════════ */}
      <footer className="lp-footer">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <div className="lp-footer-logo">
              <div className="lp-logo-mark" style={{ width: 28, height: 28 }}>
                <BookOpen size={13} color="#000" strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#e8e8e8" }}>
                Researchly
              </span>
            </div>
            <p className="lp-footer-tagline">
              AI-powered academic research for India&apos;s students and
              researchers. Search smarter, write faster, cite perfectly.
            </p>
            <div className="lp-footer-socials">
              {[
                { icon: Twitter, href: "#" },
                { icon: Github, href: "#" },
                { icon: Linkedin, href: "#" },
              ].map(({ icon: Icon, href }) => (
                <a key={href} href={href} className="lp-social-btn">
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>
          <div>
            <p className="lp-footer-col-title">Product</p>
            {[
              ["Research Search", "/search"],
              ["Literature Review", "/review"],
              ["PDF Chat", "/upload"],
              ["My Library", "/dashboard"],
              ["Pricing", "/pricing"],
            ].map(([l, h]) => (
              <Link key={h} href={h} className="lp-footer-link">
                {l}
              </Link>
            ))}
          </div>
          <div>
            <p className="lp-footer-col-title">Company</p>
            {[
              ["About", "#"],
              ["Blog", "#"],
              ["Careers", "#"],
              ["Contact", "#"],
              ["Privacy Policy", "#"],
            ].map(([l, h]) => (
              <a key={l} href={h} className="lp-footer-link">
                {l}
              </a>
            ))}
          </div>
          <div>
            <p className="lp-footer-col-title">For Students</p>
            {[
              ["JEE Prep", "#"],
              ["NEET Research", "#"],
              ["UPSC Current Affairs", "#"],
              ["GATE Resources", "#"],
              ["Citation Guide", "#"],
            ].map(([l, h]) => (
              <a key={l} href={h} className="lp-footer-link">
                {l}
              </a>
            ))}
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© 2025 Researchly. Made with ♥ in India 🇮🇳</span>
          <div style={{ display: "flex", gap: 24 }}>
            {[
              ["Terms", "#"],
              ["Privacy", "#"],
              ["Cookies", "#"],
            ].map(([l, h]) => (
              <a
                key={l}
                href={h}
                style={{
                  color: "#3a3a3a",
                  fontSize: 13,
                  transition: "color .15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#777";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#3a3a3a";
                }}
              >
                {l}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

/* Inline icon to avoid import issues with GraduationCap in .map */
function GraduationCapIcon() {
  return <GraduationCap size={14} />;
}
