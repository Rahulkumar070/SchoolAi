"use client";
import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import {
  BookOpen,
  ArrowRight,
  Check,
  Sparkles,
  Crown,
  LogOut,
  LayoutDashboard,
  ChevronDown,
  Menu,
  X,
  Search,
  FileText,
  BookMarked,
  Star,
  GraduationCap,
} from "lucide-react";
import "./landing.css";

/* ── Typing placeholder ──────────────────────────────────── */
const QUERIES = [
  "How does gut microbiome affect mental health?",
  "CRISPR gene editing in cancer therapy",
  "RLHF techniques for LLM alignment",
  "Long COVID neurological mechanisms",
  "Quantum error correction breakthroughs",
];
function TypingPlaceholder() {
  const [qi, setQi] = useState(0);
  const [text, setText] = useState("");
  const [del, setDel] = useState(false);
  useEffect(() => {
    const full = QUERIES[qi];
    let t: ReturnType<typeof setTimeout>;
    if (!del && text.length < full.length)
      t = setTimeout(() => setText(full.slice(0, text.length + 1)), 42);
    else if (!del && text.length === full.length)
      t = setTimeout(() => setDel(true), 2000);
    else if (del && text.length > 0)
      t = setTimeout(() => setText(text.slice(0, -1)), 20);
    else {
      setDel(false);
      setQi((q) => (q + 1) % QUERIES.length);
    }
    return () => clearTimeout(t);
  }, [text, del, qi]);
  return (
    <>
      {text}
      <span className="lp-cursor" />
    </>
  );
}

/* ── User dropdown ───────────────────────────────────────── */
function UserMenu({ session }: { session: any }) {
  const [open, setOpen] = useState(false);
  const plan = session.user?.plan ?? "free";
  const planLabel =
    plan === "pro" ? "Pro" : plan === "student" ? "Student" : "Free";
  const planColor =
    plan === "pro" ? "#10a37f" : plan === "student" ? "#f0a500" : "#888";
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="lp-user-btn">
        {session.user?.image ? (
          <Image
            src={session.user.image}
            alt="av"
            width={28}
            height={28}
            style={{ borderRadius: "50%" }}
          />
        ) : (
          <div className="lp-user-av">
            {(session.user?.name?.[0] ?? "U").toUpperCase()}
          </div>
        )}
        <span className="lp-user-name">
          {session.user?.name?.split(" ")[0] ?? "User"}
        </span>
        <span
          className="lp-user-plan"
          style={{ color: planColor, background: `${planColor}18` }}
        >
          {planLabel}
        </span>
        <ChevronDown size={13} color="#999" />
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
          />
          <div className="lp-dropdown">
            <div className="lp-dropdown-header">
              <p className="lp-dropdown-name">{session.user?.name}</p>
              <p className="lp-dropdown-email">{session.user?.email}</p>
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
                className="lp-dropdown-item"
                onClick={() => setOpen(false)}
              >
                <Icon size={14} /> {label}
              </Link>
            ))}
            <div className="lp-dropdown-sep" />
            <button
              onClick={() => void signOut()}
              className="lp-dropdown-signout"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [yearly, setYearly] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const FEATURES = [
    {
      icon: Search,
      title: "AI Research Search",
      desc: "Ask any research question. Get a synthesised answer with every claim cited from 200M+ peer-reviewed papers.",
      tag: "200M+ Papers",
      color: "#10a37f",
    },
    {
      icon: BookOpen,
      title: "Literature Review",
      desc: "Generate a full structured review — introduction, methodology, findings, research gaps — in under 30 seconds.",
      tag: "< 30 sec",
      color: "#2563eb",
    },
    {
      icon: FileText,
      title: "PDF Chat",
      desc: "Upload any paper. Ask about methods, results, statistics. AI understands 30+ pages of context simultaneously.",
      tag: "Any PDF",
      color: "#7c3aed",
    },
    {
      icon: BookMarked,
      title: "Citation Export",
      desc: "Save papers and export citations in APA, MLA, IEEE, Chicago, Vancouver, or BibTeX with one click.",
      tag: "6 Formats",
      color: "#dc2626",
    },
  ];

  const PLANS = [
    {
      name: "Free",
      price: "₹0",
      period: "",
      highlight: false,
      cta: "Get started",
      href: "/auth/signin",
      features: [
        "5 searches / day",
        "Cited AI answers",
        "APA & MLA citations",
        "Save 20 papers",
        "1 PDF / month",
      ],
    },
    {
      name: "Student",
      price: yearly ? "₹1,590" : "₹199",
      period: yearly ? "/year" : "/month",
      highlight: true,
      badge: "Most popular",
      cta: "Start with Student",
      href: "/pricing",
      features: [
        "500 searches / month",
        "Literature review generator",
        "All 6 citation formats",
        "20 PDFs / month",
        "Full research library",
        "Priority responses",
      ],
    },
    {
      name: "Pro",
      price: yearly ? "₹3,990" : "₹499",
      period: yearly ? "/year" : "/month",
      highlight: false,
      cta: "Get Pro",
      href: "/pricing",
      features: [
        "Unlimited searches",
        "Unlimited PDF uploads",
        "Fastest AI model",
        "API access",
        "5 team seats",
        "Priority support",
      ],
    },
  ];

  const TESTIMONIALS = [
    {
      name: "Priya Sharma",
      role: "PhD Candidate, IIT Bombay",
      av: "PS",
      text: "Cut my literature review time from 3 days to 2 hours. Citation quality is remarkable every single time.",
    },
    {
      name: "Arjun Mehta",
      role: "UPSC 2024 — AIR 87",
      av: "AM",
      text: "I use it daily for current affairs. The AI understands exactly what a civil services answer needs.",
    },
    {
      name: "Dr. Kavya Nair",
      role: "Research Scientist, DRDO",
      av: "KN",
      text: "The PDF chat is unprecedented. I can query a 50-page technical report and get precise answers in seconds.",
    },
    {
      name: "Rohan Verma",
      role: "MSc CS, IISc Bangalore",
      av: "RV",
      text: "My supervisor couldn't believe I drafted the related work section in one afternoon. Publication-ready quality.",
    },
    {
      name: "Aisha Patel",
      role: "JEE Advanced 2024 — AIR 312",
      av: "AP",
      text: "Better than any coaching material. Searched every concept I didn't understand. Got into IIT Bombay!",
    },
    {
      name: "Siddharth Rao",
      role: "Biomedical Researcher, AIIMS",
      av: "SR",
      text: "Clinical research requires precision. Researchly delivers — accurate citations and medically sound explanations.",
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
  ];

  return (
    <div className="lp">
      {/* ── NAV ──────────────────────────────────── */}
      <nav className={`lp-nav${scrolled ? " scrolled" : ""}`}>
        <div className="lp-nav-inner">
          <Link href="/" className="lp-logo">
            <div className="lp-logo-icon">
              <BookOpen size={16} strokeWidth={2.2} />
            </div>
            Researchly
          </Link>
          <div className="lp-nav-links">
            {[
              ["#features", "Features"],
              ["#how-it-works", "How it works"],
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
                  Log in
                </Link>
                <Link href="/auth/signin" className="lp-btn-primary lp-btn-sm">
                  Sign up free
                </Link>
              </>
            )}
            <button className="lp-ham" onClick={() => setMobileOpen(true)}>
              <Menu size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── MOBILE MENU ──────────────────────────── */}
      {mobileOpen && (
        <div className="lp-mobile-overlay">
          <div className="lp-mobile-header">
            <span className="lp-logo">Researchly</span>
            <button
              onClick={() => setMobileOpen(false)}
              className="lp-mobile-close"
            >
              <X size={22} />
            </button>
          </div>
          {[
            ["#features", "Features"],
            ["#how-it-works", "How it works"],
            ["#pricing", "Pricing"],
            ["#testimonials", "Reviews"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className="lp-mobile-link"
            >
              {label}
            </a>
          ))}
          <div className="lp-mobile-ctas">
            <Link
              href="/auth/signin"
              className="lp-btn-primary"
              style={{ justifyContent: "center" }}
            >
              Sign up free
            </Link>
            <Link
              href="/auth/signin"
              className="lp-btn-ghost"
              style={{ justifyContent: "center" }}
            >
              Log in
            </Link>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          1. HERO — ChatGPT style: centred, huge type, search bar
      ══════════════════════════════════════════ */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-hero-eyebrow">
            <Sparkles size={13} />
            Trusted by 10,000+ researchers across India
          </div>
          <h1 className="lp-hero-title">
            Research at the speed
            <br className="lp-br" /> of thought
          </h1>
          <p className="lp-hero-sub">
            Ask any academic question. Get cited answers from 200M+ papers —
            instantly.
          </p>

          {/* Search bar — the centrepiece */}
          <div className="lp-searchbar-wrap">
            <div className="lp-searchbar">
              <Search size={18} className="lp-searchbar-icon" />
              <input
                ref={inputRef}
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchVal.trim())
                    window.location.href = `/search?q=${encodeURIComponent(searchVal.trim())}`;
                }}
                className="lp-searchbar-input"
                placeholder=""
                aria-label="Research question"
              />
              {!searchVal && (
                <span className="lp-searchbar-placeholder" aria-hidden>
                  <TypingPlaceholder />
                </span>
              )}
              <Link
                href={
                  searchVal.trim()
                    ? `/search?q=${encodeURIComponent(searchVal.trim())}`
                    : "/search"
                }
                className={`lp-searchbar-btn${searchVal.trim() ? " active" : ""}`}
              >
                <ArrowRight size={16} />
              </Link>
            </div>
            <p className="lp-searchbar-hint">
              Searches Semantic Scholar · OpenAlex · arXiv · PubMed in parallel
            </p>
          </div>

          {/* Quick prompts */}
          <div className="lp-quick-prompts">
            {[
              "CRISPR cancer therapy",
              "Gut-brain axis",
              "Transformer attention",
              "mRNA vaccines",
              "Neuroplasticity",
            ].map((q) => (
              <button
                key={q}
                onClick={() => {
                  setSearchVal(q);
                  inputRef.current?.focus();
                }}
                className="lp-quick-chip"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Trust avatars */}
          <div className="lp-trust-row">
            <div className="lp-avatars">
              {["#10a37f", "#2563eb", "#7c3aed", "#dc2626", "#f0a500"].map(
                (c, i) => (
                  <div
                    key={i}
                    className="lp-avatar"
                    style={{
                      background: c,
                      marginLeft: i > 0 ? -10 : 0,
                      zIndex: 5 - i,
                    }}
                  >
                    {["P", "A", "R", "K", "S"][i]}
                  </div>
                ),
              )}
            </div>
            <div className="lp-trust-text">
              <div className="lp-stars">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} size={12} fill="#f0a500" color="#f0a500" />
                ))}
              </div>
              <span>
                Loved by <strong>10,000+</strong> students & researchers
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          2. LOGOS TICKER
      ══════════════════════════════════════════ */}
      <div className="lp-ticker-wrap">
        <p className="lp-ticker-label">
          Used by students at India's top institutions
        </p>
        <div className="lp-ticker-overflow">
          <div className="lp-ticker">
            {[...UNIS, ...UNIS].map((u, i) => (
              <div key={i} className="lp-ticker-item">
                <GraduationCap size={13} />
                {u}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lp-rule" />

      {/* ══════════════════════════════════════════
          3. FEATURES
      ══════════════════════════════════════════ */}
      <section id="features" className="lp-section">
        <div className="lp-section-inner">
          <p className="lp-section-eyebrow">Capabilities</p>
          <h2 className="lp-section-title">
            One platform for all your research
          </h2>
          <p className="lp-section-sub">
            Four AI tools that work together seamlessly.
          </p>
          <div className="lp-features-grid">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="lp-feat-card"
                style={{ "--feat-color": f.color } as any}
              >
                <div className="lp-feat-icon-wrap">
                  <f.icon size={20} />
                </div>
                <span className="lp-feat-tag">{f.tag}</span>
                <h3 className="lp-feat-title">{f.title}</h3>
                <p className="lp-feat-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          4. HOW IT WORKS
      ══════════════════════════════════════════ */}
      <section id="how-it-works" className="lp-section lp-how">
        <div className="lp-section-inner">
          <p className="lp-section-eyebrow">Process</p>
          <h2 className="lp-section-title">
            From question to citation-ready in minutes
          </h2>
          <div className="lp-steps">
            {[
              {
                n: "01",
                title: "Ask",
                desc: "Type any research question in plain English. No Boolean operators, no keyword tricks — just natural language.",
              },
              {
                n: "02",
                title: "Analyse",
                desc: "Our AI synthesises answers from the most relevant papers, with every claim linked back to its source.",
              },
              {
                n: "03",
                title: "Export",
                desc: "Generate literature reviews, export citations in any format, download PDFs — all from one workspace.",
              },
            ].map((s, i) => (
              <div key={i} className="lp-step">
                <span className="lp-step-n">{s.n}</span>
                <h3 className="lp-step-title">{s.title}</h3>
                <p className="lp-step-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          5. TESTIMONIALS
      ══════════════════════════════════════════ */}
      <section id="testimonials" className="lp-section">
        <div className="lp-section-inner">
          <p className="lp-section-eyebrow">Reviews</p>
          <h2 className="lp-section-title">Loved by researchers everywhere</h2>
          <div className="lp-testi-grid">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="lp-testi-card">
                <div className="lp-testi-stars">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <Star key={j} size={13} fill="#f0a500" color="#f0a500" />
                  ))}
                </div>
                <p className="lp-testi-quote">"{t.text}"</p>
                <div className="lp-testi-author">
                  <div className="lp-testi-av">{t.av}</div>
                  <div>
                    <p className="lp-testi-name">{t.name}</p>
                    <p className="lp-testi-role">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          6. PRICING
      ══════════════════════════════════════════ */}
      <section id="pricing" className="lp-section lp-pricing-section">
        <div className="lp-section-inner">
          <p className="lp-section-eyebrow">Pricing</p>
          <h2 className="lp-section-title">Simple, honest pricing</h2>
          <p className="lp-section-sub">
            Start free. Upgrade when you're ready.
          </p>

          {/* Toggle */}
          <div className="lp-toggle-row">
            <span className={`lp-tog-label${!yearly ? " on" : ""}`}>
              Monthly
            </span>
            <button
              className={`lp-tog-pill${yearly ? " on" : ""}`}
              onClick={() => setYearly((y) => !y)}
            >
              <div className="lp-tog-thumb" />
            </button>
            <span className={`lp-tog-label${yearly ? " on" : ""}`}>Annual</span>
            {yearly && <span className="lp-save-chip">Save 33%</span>}
          </div>

          <div className="lp-plans-grid">
            {PLANS.map((p, i) => (
              <div key={i} className={`lp-plan${p.highlight ? " hi" : ""}`}>
                {p.badge && (
                  <div className="lp-plan-badge">
                    <Sparkles size={10} />
                    {p.badge}
                  </div>
                )}
                <p className="lp-plan-name">{p.name}</p>
                <div className="lp-plan-price">
                  <span className="lp-plan-amount">{p.price}</span>
                  <span className="lp-plan-period">{p.period}</span>
                </div>
                <Link
                  href={p.href}
                  className={`lp-plan-cta${p.highlight ? " hi" : ""}`}
                >
                  {p.cta}
                </Link>
                <div className="lp-plan-rule" />
                <ul className="lp-plan-features">
                  {p.features.map((f, j) => (
                    <li key={j}>
                      <Check size={14} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="lp-pricing-note">
            All plans include 14-day money-back guarantee · Secure payment via
            Razorpay
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          7. FINAL CTA
      ══════════════════════════════════════════ */}
      <section className="lp-cta">
        <div className="lp-cta-inner">
          <h2 className="lp-cta-title">Start researching today</h2>
          <p className="lp-cta-sub">
            Join 10,000+ students and researchers. Free forever, no credit card
            required.
          </p>
          <div className="lp-cta-actions">
            <Link href="/auth/signin" className="lp-btn-primary lp-btn-lg">
              Sign up free <ArrowRight size={16} />
            </Link>
            <Link href="/pricing" className="lp-btn-ghost lp-btn-lg">
              View pricing
            </Link>
          </div>
          <p className="lp-cta-note">Google or GitHub login · No credit card</p>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          8. FOOTER
      ══════════════════════════════════════════ */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <Link href="/" className="lp-logo" style={{ marginBottom: 12 }}>
              <div className="lp-logo-icon">
                <BookOpen size={14} strokeWidth={2.2} />
              </div>
              Researchly
            </Link>
            <p className="lp-footer-tagline">
              AI-powered academic research for India's students and researchers.
            </p>
          </div>
          <div>
            <p className="lp-footer-col-title">Product</p>
            {[
              ["Research Search", "/search"],
              ["Literature Review", "/review"],
              ["PDF Chat", "/upload"],
              ["Dashboard", "/dashboard"],
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
              ["Privacy", "#"],
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
              ["UPSC Affairs", "#"],
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
          <span>© 2025 Researchly · Made with ♥ in India 🇮🇳</span>
          <div className="lp-footer-legal">
            {[
              ["Terms", "#"],
              ["Privacy", "#"],
              ["Cookies", "#"],
            ].map(([l, h]) => (
              <a key={l} href={h} className="lp-footer-legal-link">
                {l}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
