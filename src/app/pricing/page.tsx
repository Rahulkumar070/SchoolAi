"use client";
import { useState, useRef, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  Check, BookOpen, Zap, Crown, Sparkles, ShieldCheck,
  CreditCard, Smartphone, Building2, ArrowRight, ChevronDown, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";

declare global {
  interface Window {
    Razorpay: new (opts: RzpOpts) => {
      open(): void;
      on(e: string, cb: (r: unknown) => void): void;
    };
  }
}
interface RzpOpts {
  key: string; subscription_id: string; name: string; description: string;
  prefill: { name: string; email: string }; theme: { color: string };
  handler(r: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }): void;
  modal?: { ondismiss?(): void };
}

const PLANS = [
  {
    id: "free", name: "Free", inr: "₹0", period: "", desc: "Perfect to get started",
    planId: "", planLabel: "", highlight: false, icon: Zap, accentColor: "#888888",
    features: ["5 AI searches / day","Cited answers from 200M+ papers","APA & MLA citations","Save 20 papers","1 PDF upload / month"],
    cta: "Get started free",
  },
  {
    id: "student", name: "Student", inr: "₹199", period: "/mo", desc: "For students & researchers",
    planId: process.env.NEXT_PUBLIC_RAZORPAY_STUDENT_PLAN_ID ?? "", planLabel: "Student Plan",
    highlight: true, icon: Sparkles, accentColor: "#D4C5A0",
    features: ["500 searches / month","Full literature reviews","All 6 citation formats","20 PDF uploads / month","Unlimited paper library","Search history","Priority Claude AI"],
    cta: "Subscribe — ₹199/mo",
  },
  {
    id: "pro", name: "Pro", inr: "₹499", period: "/mo", desc: "For researchers & teams",
    planId: process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID ?? "", planLabel: "Pro Plan",
    highlight: false, icon: Crown, accentColor: "#7ea8c9",
    features: ["Unlimited searches","Unlimited PDF uploads","Research gap analysis","API access (100 req/day)","Team sharing (5 seats)","Priority email support","Early feature access"],
    cta: "Subscribe — ₹499/mo",
  },
];

const FAQS = [
  { q: "Is payment secure?", a: "All payments are processed by Razorpay — PCI-DSS certified, used by Zomato, Swiggy, and 5M+ businesses across India." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your dashboard in one click. Your plan stays active until the billing period ends, then reverts to Free." },
  { q: "Does it auto-renew?", a: "Yes, monthly. You'll receive an email before each charge. Cancel anytime with no questions asked." },
  { q: "Do you store card details?", a: "No. Razorpay handles all card data with bank-level encryption. We never see or store your payment information." },
  { q: "What if my payment fails?", a: "Razorpay retries automatically. If it keeps failing, reach us at hello.researchly@gmail.com — we'll sort it out." },
  { q: "Is there a student discount?", a: "₹199/mo is already our student-friendly price. Email us with your college ID for special institutional rates." },
];

function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  if (typeof window !== "undefined") {
    // only add listener after mount
  }
  return (
    <div
      ref={ref}
      id="cursor-glow"
      style={{
        position: "fixed", pointerEvents: "none", zIndex: 0,
        width: 500, height: 500, borderRadius: "50%",
        transform: "translate(-50%,-50%)",
        background: "radial-gradient(circle, rgba(212,197,160,0.035) 0%, transparent 70%)",
        transition: "left 0.15s ease-out, top 0.15s ease-out",
        top: "50%", left: "50%",
      }}
    />
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #1A1A1A" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "20px 0",
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left", gap: 16,
        }}
      >
        <span style={{ fontSize: 14.5, fontWeight: 500, color: "#DDD9D3", lineHeight: 1.45 }}>{q}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }}>
          <ChevronDown size={15} style={{ color: "#555", flexShrink: 0 }} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <p style={{ fontSize: 13.5, color: "#5A5A5A", lineHeight: 1.85, paddingBottom: 20, paddingRight: 28 }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlanCard({ plan, idx, onSubscribe, paying }: {
  plan: typeof PLANS[0]; idx: number;
  onSubscribe: (p: typeof PLANS[0]) => void; paying: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const [hovered, setHovered] = useState(false);
  const busy = paying === plan.id;
  const Icon = plan.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 44, scale: plan.highlight ? 0.94 : 1 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, delay: 0.08 + idx * 0.14, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", borderRadius: 20, padding: "32px 26px",
        display: "flex", flexDirection: "column",
        background: plan.highlight ? "#130F0A" : "#0F0F0F",
        border: `1px solid ${plan.highlight ? (hovered ? "rgba(212,197,160,0.5)" : "rgba(212,197,160,0.25)") : (hovered ? "#2A2A2A" : "#191919")}`,
        transform: hovered ? "translateY(-8px)" : "translateY(0)",
        transition: "transform 0.32s cubic-bezier(0.22,1,0.36,1), box-shadow 0.32s ease, border-color 0.25s ease",
        boxShadow: plan.highlight
          ? hovered ? "0 0 0 1px rgba(212,197,160,0.35), 0 32px 80px rgba(0,0,0,0.7), 0 0 48px rgba(212,197,160,0.1)"
                   : "0 0 0 1px rgba(212,197,160,0.12), 0 24px 60px rgba(0,0,0,0.55), 0 0 80px rgba(212,197,160,0.055)"
          : hovered ? "0 20px 52px rgba(0,0,0,0.7)" : "none",
        overflow: "hidden",
      }}
    >
      {/* Breathing glow for popular card */}
      {plan.highlight && (
        <motion.div
          animate={{ opacity: [0.3, 0.75, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute", top: -70, left: "50%", transform: "translateX(-50%)",
            width: 260, height: 160, borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(212,197,160,0.16) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}
      {/* Bottom accent glow on hover */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{
            position: "absolute", bottom: -40, left: "50%", transform: "translateX(-50%)",
            width: 180, height: 100, borderRadius: "50%",
            background: `radial-gradient(ellipse, ${plan.accentColor}18 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Popular badge */}
      {plan.highlight && (
        <div style={{
          position: "absolute", top: 18, right: 18,
          padding: "3px 10px", borderRadius: 999,
          background: "rgba(212,197,160,0.08)", border: "1px solid rgba(212,197,160,0.28)",
          fontSize: 9, fontWeight: 800, color: "#D4C5A0", letterSpacing: "0.14em", textTransform: "uppercase",
        }}>POPULAR</div>
      )}

      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 13,
        background: `${plan.accentColor}13`, border: `1px solid ${plan.accentColor}26`,
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
        transition: "background 0.2s, border-color 0.2s",
        ...(hovered ? { background: `${plan.accentColor}20`, borderColor: `${plan.accentColor}40` } : {}),
      }}>
        <Icon size={19} style={{ color: plan.accentColor }} />
      </div>

      <p style={{ fontSize: 17, fontWeight: 700, color: "#FFFFFF", marginBottom: 4, letterSpacing: "-0.025em" }}>{plan.name}</p>
      <p style={{ fontSize: 12.5, color: "#444", marginBottom: 26, fontWeight: 400 }}>{plan.desc}</p>

      {/* Price */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 28 }}>
        <span style={{
          fontFamily: "'Instrument Serif', 'Lora', Georgia, serif",
          fontSize: 54, fontWeight: 400, lineHeight: 1, letterSpacing: "-2.5px",
          color: plan.highlight ? "#D4C5A0" : "#FFFFFF",
        }}>{plan.inr}</span>
        {plan.period && (
          <span style={{ fontSize: 13, color: "#3A3A3A", paddingBottom: 9 }}>{plan.period}</span>
        )}
      </div>

      {/* CTA */}
      <motion.button
        onClick={() => onSubscribe(plan)} disabled={busy}
        whileHover={!busy ? { scale: 1.02 } : {}} whileTap={!busy ? { scale: 0.97 } : {}}
        style={{
          position: "relative", width: "100%", padding: "13px 16px", borderRadius: 12,
          border: plan.highlight ? "none" : "1px solid #252525",
          background: plan.highlight ? "#D4C5A0" : "#151515",
          color: plan.highlight ? "#0A0A0A" : "#DDDDDD",
          fontFamily: "inherit", fontSize: 13.5, fontWeight: 700,
          cursor: busy ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          opacity: busy ? 0.65 : 1, overflow: "hidden", marginBottom: 26,
        }}
      >
        {/* Shimmer sweep */}
        {plan.highlight && hovered && !busy && (
          <motion.div
            initial={{ x: "-120%" }} animate={{ x: "220%" }}
            transition={{ duration: 0.7, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.5 }}
            style={{
              position: "absolute", top: 0, left: 0, bottom: 0, width: "55%",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
              pointerEvents: "none",
            }}
          />
        )}
        {busy
          ? <><Loader2 size={13} style={{ animation: "pricing-spin 0.7s linear infinite" }} /> Opening checkout…</>
          : <>{plan.cta}{plan.id !== "free" && <ArrowRight size={13} />}</>}
      </motion.button>

      <div style={{ height: 1, background: "#181818", marginBottom: 24 }} />

      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {plan.features.map((f, fi) => (
          <motion.li
            key={f}
            initial={{ opacity: 0, x: -10 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.35, delay: 0.28 + idx * 0.14 + fi * 0.04 }}
            style={{ display: "flex", alignItems: "flex-start", gap: 10, lineHeight: 1.45 }}
          >
            <div style={{
              width: 17, height: 17, borderRadius: 5, flexShrink: 0, marginTop: 2,
              background: hovered ? `${plan.accentColor}22` : `${plan.accentColor}10`,
              border: `1px solid ${hovered ? plan.accentColor + "44" : plan.accentColor + "20"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
            }}>
              <Check size={9} style={{ color: plan.accentColor }} />
            </div>
            <span style={{ fontSize: 13.5, color: hovered ? "#999" : "#666", transition: "color 0.2s" }}>{f}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

export default function Pricing() {
  const { data: session } = useSession();
  const router = useRouter();
  const [paying, setPaying] = useState("");

  const trustRef = useRef(null);
  const trustInView = useInView(trustRef, { once: true, margin: "-40px" });
  const faqRef = useRef(null);
  const faqInView = useInView(faqRef, { once: true, margin: "-40px" });
  const ctaRef = useRef(null);
  const ctaInView = useInView(ctaRef, { once: true, margin: "-40px" });

  const subscribe = useCallback(async (plan: typeof PLANS[0]) => {
    if (plan.id === "free") { router.push(session ? "/search" : "/auth/signin"); return; }
    if (!session) { void signIn(); return; }
    if (!plan.planId) { toast.error("Payment not configured. Add NEXT_PUBLIC_RAZORPAY_STUDENT_PLAN_ID to .env"); return; }
    setPaying(plan.id);
    try {
      const r = await fetch("/api/razorpay/order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.planId, planName: plan.planLabel }),
      });
      const d = (await r.json()) as any;
      if (!r.ok || !d.subscriptionId) { toast.error(d.error ?? "Order failed"); setPaying(""); return; }
      const opts: RzpOpts = {
        key: d.razorpayKeyId ?? "", subscription_id: d.subscriptionId,
        name: "Researchly", description: plan.planLabel,
        prefill: { name: d.userName ?? "", email: d.userEmail ?? "" },
        theme: { color: "#D4C5A0" },
        handler: async (resp) => {
          try {
            const v = await fetch("/api/razorpay/verify", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...resp, planName: plan.planLabel }),
            });
            const vd = (await v.json()) as any;
            if (vd.success) { toast.success(`🎉 ${plan.name} plan activated!`); router.push("/dashboard?upgraded=1"); }
            else toast.error(vd.error ?? "Verification failed");
          } catch { toast.error("Verification error. Contact support."); }
          finally { setPaying(""); }
        },
        modal: { ondismiss: () => setPaying("") },
      };
      const rzp = new window.Razorpay(opts);
      rzp.on("payment.failed", () => { toast.error("Payment failed. Try again."); setPaying(""); });
      rzp.open();
    } catch (e) { toast.error((e as Error).message); setPaying(""); }
  }, [session, router]);

  const words = ["Research", "without", "limits"];
  const trustItems = [
    { Icon: ShieldCheck, color: "#5db87a", label: "PCI-DSS Certified", sub: "Bank-level security" },
    { Icon: CreditCard, color: "#D4C5A0", label: "All Payment Methods", sub: "UPI, Cards, Net Banking" },
    { Icon: Zap, color: "#7ea8c9", label: "Instant Activation", sub: "Access within seconds" },
    { Icon: Sparkles, color: "#ad73e0", label: "14-Day Guarantee", sub: "Full refund, no questions" },
  ];
  const chips = [
    { Icon: Smartphone, label: "UPI / GPay" },
    { Icon: CreditCard, label: "Cards" },
    { Icon: Building2, label: "Net Banking" },
    { Icon: ShieldCheck, label: "Razorpay Secured" },
  ];

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');
        @keyframes pricing-spin { to { transform: rotate(360deg); } }
        .pricing-root { background: #0A0A0A; min-height: 100vh; font-family: 'DM Sans', -apple-system, sans-serif; color: #FFF; position: relative; overflow-x: hidden; }
        .pricing-grain { position: fixed; inset: 0; pointer-events: none; z-index: 1; opacity: 0.032;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
        .pricing-content { position: relative; z-index: 2; }
        .pricing-nav { position: sticky; top: 0; z-index: 50; background: rgba(10,10,10,0.88); border-bottom: 1px solid #141414; backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px); }
        .pricing-nav-inner { max-width: 1040px; margin: 0 auto; height: 58px; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; }
        .pricing-main { max-width: 1040px; margin: 0 auto; padding: 0 28px; }
        .plans-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 88px; align-items: start; }
        .trust-grid { display: grid; grid-template-columns: repeat(4, 1fr); }
        .chips-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
        .hero-title { font-family: 'Instrument Serif', 'Lora', Georgia, serif; font-size: clamp(2.8rem, 7vw, 5.2rem); font-weight: 400; color: #FFF; line-height: 1.04; letter-spacing: -0.035em; margin-bottom: 22px; display: flex; flex-wrap: wrap; justify-content: center; gap: 0 14px; }

        @media (max-width: 900px) {
          .plans-grid { grid-template-columns: 1fr; gap: 14px; }
          .trust-grid { grid-template-columns: repeat(2, 1fr); }
          .pricing-main { padding: 0 20px; }
          .hero-title { font-size: clamp(2.4rem, 9vw, 3.6rem); }
        }
        @media (max-width: 540px) {
          .pricing-nav-inner { padding: 0 16px; }
          .pricing-main { padding: 0 14px; }
        }
      `}</style>

      <div className="pricing-root" onMouseMove={(e) => {
        const el = document.getElementById("cursor-glow");
        if (el) { el.style.left = e.clientX + "px"; el.style.top = e.clientY + "px"; }
      }}>
        <div className="pricing-grain" />

        {/* Cursor glow */}
        <div id="cursor-glow" style={{
          position: "fixed", pointerEvents: "none", zIndex: 0,
          width: 500, height: 500, borderRadius: "50%", transform: "translate(-50%,-50%)",
          background: "radial-gradient(circle, rgba(212,197,160,0.038) 0%, transparent 70%)",
          transition: "left 0.14s ease-out, top 0.14s ease-out",
          top: "50%", left: "50%",
        }} />

        {/* Ambient radials */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1 }}>
          <motion.div
            animate={{ opacity: [0.4, 0.75, 0.4], scale: [1, 1.1, 1] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute", top: "8%", left: "18%", width: 520, height: 520, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(212,197,160,0.042) 0%, transparent 65%)", filter: "blur(48px)",
            }}
          />
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.12, 1] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 4 }}
            style={{
              position: "absolute", bottom: "18%", right: "12%", width: 420, height: 420, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(126,168,201,0.048) 0%, transparent 65%)", filter: "blur(48px)",
            }}
          />
        </div>

        <div className="pricing-content">
          {/* Nav */}
          <nav className="pricing-nav">
            <div className="pricing-nav-inner">
              <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "#D4C5A0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BookOpen size={13} color="#0A0A0A" strokeWidth={2.5} />
                </div>
                <span style={{ fontWeight: 700, fontSize: 14.5, color: "#FFF", letterSpacing: "-0.02em" }}>Researchly</span>
              </Link>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Link href="/search" style={{ fontSize: 13, color: "#555", padding: "6px 12px", borderRadius: 8, textDecoration: "none", transition: "color .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#BBB")} onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
                  Search
                </Link>
                {session ? (
                  <Link href="/search" style={{ fontSize: 13, fontWeight: 600, color: "#DDD", padding: "7px 16px", borderRadius: 9, border: "1px solid #222", textDecoration: "none", transition: "border-color .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "#363636")} onMouseLeave={e => (e.currentTarget.style.borderColor = "#222")}>
                    Open app
                  </Link>
                ) : (
                  <button onClick={() => void signIn()} style={{ fontSize: 13, fontWeight: 700, color: "#0A0A0A", padding: "7px 16px", borderRadius: 9, background: "#D4C5A0", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    Sign in
                  </button>
                )}
              </div>
            </div>
          </nav>

          <div className="pricing-main">
            {/* Hero */}
            <div style={{ textAlign: "center", padding: "84px 0 68px" }}>
              <motion.div
                initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 14px",
                  borderRadius: 999, background: "rgba(212,197,160,0.07)",
                  border: "1px solid rgba(212,197,160,0.22)", fontSize: 11, fontWeight: 700,
                  color: "#D4C5A0", letterSpacing: "0.11em", textTransform: "uppercase", marginBottom: 30,
                }}
              >✦ Simple Pricing</motion.div>

              {/* Hero title - word split animation */}
              <h1 className="hero-title">
                {words.map((word, i) => (
                  <motion.span key={word}
                    initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.68, delay: 0.18 + i * 0.09, ease: [0.22, 1, 0.36, 1] }}
                    style={{ display: "inline-block" }}
                  >{word}</motion.span>
                ))}
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.58, delay: 0.48 }}
                style={{ fontSize: 15.5, color: "#5C5C5C", maxWidth: 400, margin: "0 auto 34px", lineHeight: 1.8, fontWeight: 300 }}
              >
                Pay instantly — UPI, cards, net banking. No emails, no waiting.
              </motion.p>

              {/* Payment chips */}
              <div className="chips-row">
                {chips.map(({ Icon, label }, i) => (
                  <motion.span key={label}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.42, delay: 0.56 + i * 0.06 }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 13px",
                      borderRadius: 999, background: "#0F0F0F", border: "1px solid #1D1D1D",
                      fontSize: 12, color: "#555", fontWeight: 500,
                    }}
                  >
                    <Icon size={11} style={{ color: "#D4C5A0" }} /> {label}
                  </motion.span>
                ))}
              </div>
            </div>

            {/* Trust bar */}
            <motion.div ref={trustRef}
              initial={{ opacity: 0, y: 22 }} animate={trustInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.52 }}
              style={{ borderRadius: 18, background: "#0D0D0D", border: "1px solid #181818", marginBottom: 68, overflow: "hidden" }}
            >
              <div className="trust-grid">
                {trustItems.map(({ Icon, color, label, sub }, i) => (
                  <motion.div key={label}
                    initial={{ opacity: 0, y: 18 }} animate={trustInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.45, delay: i * 0.09, type: "spring", stiffness: 180, damping: 18 }}
                    style={{
                      display: "flex", alignItems: "center", gap: 14, padding: "24px 22px",
                      borderRight: i % 2 === 0 ? "1px solid #161616" : "none",
                      borderBottom: i < 2 ? "1px solid #161616" : "none",
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                      background: `${color}0E`, border: `1px solid ${color}1E`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={17} style={{ color }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#DDD9D3", marginBottom: 3 }}>{label}</p>
                      <p style={{ fontSize: 11.5, color: "#3E3E3E" }}>{sub}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Plans */}
            <div className="plans-grid">
              {PLANS.map((plan, idx) => (
                <PlanCard key={plan.id} plan={plan} idx={idx} onSubscribe={subscribe} paying={paying} />
              ))}
            </div>

            {/* FAQ */}
            <motion.div ref={faqRef}
              initial={{ opacity: 0, y: 26 }} animate={faqInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.58 }}
              style={{ maxWidth: 660, margin: "0 auto 88px" }}
            >
              <div style={{ textAlign: "center", marginBottom: 48 }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#2E2E2E", marginBottom: 16 }}>FAQ</p>
                <h2 style={{ fontFamily: "'Instrument Serif', 'Lora', Georgia, serif", fontSize: "clamp(1.6rem,3vw,2.2rem)", fontWeight: 400, color: "#FFF", letterSpacing: "-0.03em" }}>
                  Questions? Answered.
                </h2>
              </div>
              <div style={{ borderTop: "1px solid #1A1A1A" }}>
                {FAQS.map(faq => <FaqItem key={faq.q} {...faq} />)}
              </div>
            </motion.div>

            {/* CTA */}
            <motion.div ref={ctaRef}
              initial={{ opacity: 0, y: 32 }} animate={ctaInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
              style={{
                textAlign: "center", padding: "68px 32px",
                borderRadius: 24, background: "#0D0D0D", border: "1px solid #181818",
                position: "relative", overflow: "hidden", marginBottom: 88,
              }}
            >
              <motion.div
                animate={{ opacity: [0.45, 0.9, 0.45] }} transition={{ duration: 5, repeat: Infinity }}
                style={{
                  position: "absolute", top: -90, left: "50%", transform: "translateX(-50%)",
                  width: 440, height: 300, borderRadius: "50%",
                  background: "radial-gradient(ellipse, rgba(212,197,160,0.07) 0%, transparent 70%)",
                  pointerEvents: "none",
                }}
              />
              <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#2E2E2E", marginBottom: 18 }}>Get started today</p>
              <h3 style={{ fontFamily: "'Instrument Serif', 'Lora', Georgia, serif", fontSize: "clamp(1.7rem,4vw,2.8rem)", fontWeight: 400, color: "#FFF", marginBottom: 14, letterSpacing: "-0.035em" }}>
                Ready to research smarter?
              </h3>
              <p style={{ fontSize: 14.5, color: "#484848", marginBottom: 36, lineHeight: 1.8, fontWeight: 300 }}>
                Join 10,000+ students and researchers. Start free, upgrade anytime.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Link href={session ? "/search" : "/auth/signin"} style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "14px 28px", borderRadius: 12, background: "#D4C5A0",
                    color: "#0A0A0A", fontSize: 14, fontWeight: 700, textDecoration: "none",
                  }}>
                    Start for free <ArrowRight size={14} />
                  </Link>
                </motion.div>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Link href="/search" style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "14px 24px", borderRadius: 12, border: "1px solid #222",
                    color: "#666", fontSize: 14, fontWeight: 500, textDecoration: "none",
                    transition: "border-color .15s, color .15s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#BBB"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.color = "#666"; }}
                  >Try for free</Link>
                </motion.div>
              </div>
            </motion.div>
          </div>

          {/* Footer */}
          <footer style={{ borderTop: "1px solid #111", padding: "24px 28px" }}>
            <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#282828" }}>
                  © 2026 Researchly · Built by <strong style={{ color: "#3C3C3C" }}>Rahulkumar Pal</strong> · Made in India 🇮🇳
                </span>
                <a href="mailto:hello.researchly@gmail.com" style={{ fontSize: 11.5, color: "#D4C5A0", textDecoration: "none" }}>
                  hello.researchly@gmail.com
                </a>
              </div>
              <span style={{ fontSize: 12, color: "#282828", display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={11} style={{ color: "#5db87a" }} /> Payments secured by Razorpay
              </span>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
