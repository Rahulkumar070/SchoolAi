"use client";
import { useState, useRef, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  Check,
  BookOpen,
  ShieldCheck,
  CreditCard,
  ChevronDown,
  Loader2,
  ArrowLeft,
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
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
  theme: { color: string };
  handler(r: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }): void;
  modal?: { ondismiss?(): void };
}

/* ── Branch / tree SVG icon (matches Claude's aesthetic) ── */
function BranchIcon({
  size = 56,
  color = "#888",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="28"
        cy="10"
        r="4"
        stroke={color}
        strokeWidth="1.6"
        fill="none"
      />
      <circle
        cx="12"
        cy="32"
        r="4"
        stroke={color}
        strokeWidth="1.6"
        fill="none"
      />
      <circle
        cx="28"
        cy="32"
        r="4"
        stroke={color}
        strokeWidth="1.6"
        fill="none"
      />
      <circle
        cx="44"
        cy="32"
        r="4"
        stroke={color}
        strokeWidth="1.6"
        fill="none"
      />
      <circle
        cx="20"
        cy="48"
        r="4"
        stroke={color}
        strokeWidth="1.6"
        fill="none"
      />
      <circle
        cx="36"
        cy="48"
        r="4"
        stroke={color}
        strokeWidth="1.6"
        fill="none"
      />
      <line
        x1="28"
        y1="14"
        x2="12"
        y2="28"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="28"
        y1="14"
        x2="28"
        y2="28"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="28"
        y1="14"
        x2="44"
        y2="28"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="36"
        x2="20"
        y2="44"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="28"
        y1="36"
        x2="20"
        y2="44"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="28"
        y1="36"
        x2="36"
        y2="44"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="44"
        y1="36"
        x2="36"
        y2="44"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const PLANS = [
  {
    id: "free",
    name: "Free",
    desc: "Start researching for free",
    inr: "₹0",
    period: "",
    planId: "",
    planLabel: "",
    ctaText: "Get started free",
    ctaStyle: "ghost" as const,
    iconColor: "#555",
    features: [
      "5 AI searches / day",
      "Cited answers from 200M+ papers",
      "APA & MLA citations",
      "Save up to 20 papers",
      "Access to arXiv, PubMed, OpenAlex",
    ],
  },
  {
    id: "student",
    name: "Student",
    desc: "For students & researchers",
    inr: "₹199",
    period: "INR / month",
    planId: process.env.NEXT_PUBLIC_RAZORPAY_STUDENT_PLAN_ID ?? "",
    planLabel: "Student Plan",
    ctaText: "Subscribe to Student",
    ctaStyle: "solid" as const,
    iconColor: "#D4C5A0",
    features: [
      "500 searches / month",
      "Full AI literature reviews",
      "All 6 citation formats",
      "20 PDF uploads / month",
      "Unlimited paper library",
      "Search history",
      "Priority Claude AI",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    desc: "For researchers & teams",
    inr: "₹499",
    period: "INR / month",
    planId: process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID ?? "",
    planLabel: "Pro Plan",
    ctaText: "Subscribe to Pro",
    ctaStyle: "ghost" as const,
    iconColor: "#aaa",
    features: [
      "Unlimited searches",
      "Unlimited PDF uploads",
      "Research gap analysis",
      "API access (100 req / day)",
      "Team sharing (5 seats)",
      "Priority email support",
      "Early feature access",
    ],
  },
];

const FAQS = [
  {
    q: "Is payment secure?",
    a: "All payments are processed by Razorpay — PCI-DSS certified, used by Zomato, Swiggy, and 5M+ businesses across India.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your dashboard in one click. Your plan stays active until the billing period ends, then reverts to Free.",
  },
  {
    q: "Does it auto-renew?",
    a: "Yes, monthly. You'll receive an email before each charge. Cancel anytime with no questions asked.",
  },
  {
    q: "Do you store card details?",
    a: "No. Razorpay handles all card data with bank-level encryption. We never see or store your payment information.",
  },
  {
    q: "What if my payment fails?",
    a: "Razorpay retries automatically. If it keeps failing, reach us at hello.researchly@gmail.com — we'll sort it out.",
  },
  {
    q: "Is there a student discount?",
    a: "₹199/mo is already our student-friendly price. Email us with your college ID for special institutional rates.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #232323" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 0",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          gap: 16,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: "#ccc",
            lineHeight: 1.5,
          }}
        >
          {q}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={14} style={{ color: "#555", flexShrink: 0 }} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <p
              style={{
                fontSize: 13.5,
                color: "#555",
                lineHeight: 1.8,
                paddingBottom: 18,
                paddingRight: 24,
              }}
            >
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlanCard({
  plan,
  idx,
  onSubscribe,
  paying,
  popular,
}: {
  plan: (typeof PLANS)[0];
  idx: number;
  onSubscribe: (p: (typeof PLANS)[0]) => void;
  paying: string;
  popular?: boolean;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const busy = paying === plan.id;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className={`plan-card${popular ? " plan-card-popular" : ""}`}
    >
      {/* Plan tree icon */}
      <div style={{ marginBottom: 20 }}>
        <BranchIcon size={52} color={plan.iconColor} />
      </div>

      {/* Name + desc */}
      <p className="plan-name">{plan.name}</p>
      <p className="plan-desc">{plan.desc}</p>

      {/* Price */}
      <div className="plan-price-row">
        <span className="plan-price">{plan.inr}</span>
        {plan.period && (
          <div className="plan-period-stack">
            <span>{plan.period}</span>
            {plan.id !== "free" && (
              <span style={{ color: "#555" }}>billed monthly</span>
            )}
          </div>
        )}
      </div>

      {/* CTA button */}
      <button
        className={`plan-btn plan-btn-${plan.ctaStyle}`}
        onClick={() => onSubscribe(plan)}
        disabled={busy}
      >
        {busy ? (
          <>
            <Loader2 size={13} className="spin-icon" /> Opening checkout…
          </>
        ) : (
          plan.ctaText
        )}
      </button>

      {/* Divider */}
      <div className="plan-divider" />

      {/* Features */}
      <ul className="plan-features">
        {plan.features.map((f, fi) => (
          <motion.li
            key={f}
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.3, delay: 0.2 + idx * 0.08 + fi * 0.04 }}
          >
            <Check size={13} className="feature-check" />
            <span>{f}</span>
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

  const faqRef = useRef(null);
  const faqInView = useInView(faqRef, { once: true, margin: "-40px" });
  const cardsRef = useRef(null);
  const cardsInView = useInView(cardsRef, { once: true, margin: "-40px" });

  const subscribe = useCallback(
    async (plan: (typeof PLANS)[0]) => {
      if (plan.id === "free") {
        router.push(session ? "/search" : "/auth/signin");
        return;
      }
      if (!session) {
        void signIn();
        return;
      }
      if (!plan.planId) {
        toast.error("Payment not configured.");
        return;
      }
      setPaying(plan.id);
      try {
        const r = await fetch("/api/razorpay/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: plan.planId,
            planName: plan.planLabel,
          }),
        });
        const d = (await r.json()) as any;
        if (!r.ok || !d.subscriptionId) {
          toast.error(d.error ?? "Order failed");
          setPaying("");
          return;
        }
        const opts: RzpOpts = {
          key: d.razorpayKeyId ?? "",
          subscription_id: d.subscriptionId,
          name: "Researchly",
          description: plan.planLabel,
          prefill: { name: d.userName ?? "", email: d.userEmail ?? "" },
          theme: { color: "#D4C5A0" },
          handler: async (resp) => {
            try {
              const v = await fetch("/api/razorpay/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...resp, planName: plan.planLabel }),
              });
              const vd = (await v.json()) as any;
              if (vd.success) {
                toast.success(`🎉 ${plan.name} plan activated!`);
                router.push("/dashboard?upgraded=1");
              } else toast.error(vd.error ?? "Verification failed");
            } catch {
              toast.error("Verification error. Contact support.");
            } finally {
              setPaying("");
            }
          },
          modal: { ondismiss: () => setPaying("") },
        };
        const rzp = new window.Razorpay(opts);
        rzp.on("payment.failed", () => {
          toast.error("Payment failed. Try again.");
          setPaying("");
        });
        rzp.open();
      } catch (e) {
        toast.error((e as Error).message);
        setPaying("");
      }
    },
    [session, router],
  );

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
      />

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .pr-root {
          background: #1a1a1a;
          min-height: 100vh;
          font-family: -apple-system, 'Söhne', 'Inter', BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #fff;
        }

        /* ── NAV ── */
        .pr-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 24px;
          border-bottom: 1px solid #2a2a2a;
          position: sticky; top: 0; z-index: 50;
          background: rgba(26,26,26,0.92);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .pr-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; }
        .pr-logo-box {
          width: 26px; height: 26px; border-radius: 7px;
          background: #D4C5A0;
          display: flex; align-items: center; justify-content: center;
        }
        .pr-logo-text { font-size: 14px; font-weight: 600; color: #fff; letter-spacing: -0.01em; }
        .pr-nav-actions { display: flex; align-items: center; gap: 6px; }
        .pr-back-btn {
          display: flex; align-items: center; gap: 6px;
          background: none; border: none; cursor: pointer;
          color: #666; font-size: 13px; font-family: inherit;
          padding: 6px 10px; border-radius: 8px;
          transition: color 0.15s, background 0.15s;
          text-decoration: none;
        }
        .pr-back-btn:hover { color: #bbb; background: rgba(255,255,255,0.05); }
        .pr-signin-btn {
          font-size: 13px; font-weight: 600; color: #0A0A0A;
          padding: 7px 16px; border-radius: 8px;
          background: #D4C5A0; border: none;
          cursor: pointer; font-family: inherit;
          transition: opacity 0.15s;
        }
        .pr-signin-btn:hover { opacity: 0.88; }
        .pr-open-btn {
          font-size: 13px; font-weight: 500; color: #ccc;
          padding: 7px 16px; border-radius: 8px;
          background: rgba(255,255,255,0.06);
          border: 1px solid #333; cursor: pointer;
          font-family: inherit; text-decoration: none;
          display: inline-flex; align-items: center;
          transition: background 0.15s;
        }
        .pr-open-btn:hover { background: rgba(255,255,255,0.1); }

        /* ── HERO ── */
        .pr-hero {
          text-align: center;
          padding: 72px 24px 56px;
          max-width: 880px;
          margin: 0 auto;
        }
        .pr-hero h1 {
          font-size: clamp(1.9rem, 4vw, 2.6rem);
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.03em;
          line-height: 1.15;
          margin-bottom: 0;
        }

        /* ── PLAN CARDS ── */
        .pr-cards-wrap {
          max-width: 1060px;
          margin: 0 auto;
          padding: 0 24px 80px;
        }
        .pr-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          overflow: hidden;
        }
        .plan-card {
          padding: 32px 28px 36px;
          display: flex; flex-direction: column;
          border-right: 1px solid #2a2a2a;
          background: #1e1e1e;
          position: relative;
        }
        .plan-card:last-child { border-right: none; }
        .plan-card-popular {
          background: #1e1e1e;
        }

        .plan-name {
          font-size: 18px; font-weight: 600;
          color: #fff; letter-spacing: -0.02em;
          margin-bottom: 6px;
        }
        .plan-desc {
          font-size: 13px; color: #666;
          margin-bottom: 22px; line-height: 1.5;
        }
        .plan-price-row {
          display: flex; align-items: flex-end;
          gap: 8px; margin-bottom: 22px;
        }
        .plan-price {
          font-size: 42px; font-weight: 600;
          color: #fff; letter-spacing: -2px; line-height: 1;
        }
        .plan-period-stack {
          display: flex; flex-direction: column;
          font-size: 11px; color: #888;
          padding-bottom: 5px; line-height: 1.5;
        }

        /* CTA buttons */
        .plan-btn {
          width: 100%; padding: 12px 16px;
          border-radius: 8px; font-family: inherit;
          font-size: 14px; font-weight: 500;
          cursor: pointer; display: flex;
          align-items: center; justify-content: center; gap: 6px;
          margin-bottom: 28px;
          transition: opacity 0.15s, background 0.15s;
        }
        .plan-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .plan-btn-solid {
          background: #fff; color: #111; border: none;
        }
        .plan-btn-solid:hover:not(:disabled) { background: #f0f0f0; }
        .plan-btn-ghost {
          background: transparent;
          color: #ccc;
          border: 1px solid #333;
        }
        .plan-btn-ghost:hover:not(:disabled) {
          background: rgba(255,255,255,0.06);
          border-color: #444; color: #fff;
        }

        .plan-divider {
          height: 1px; background: #2a2a2a; margin-bottom: 24px;
        }

        /* Features list */
        .plan-features {
          list-style: none;
          display: flex; flex-direction: column;
          gap: 13px; flex: 1;
        }
        .plan-features li {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 13.5px; color: #888; line-height: 1.45;
        }
        .feature-check {
          color: #555; flex-shrink: 0; margin-top: 2px;
        }

        @keyframes spin-icon { to { transform: rotate(360deg); } }
        .spin-icon { animation: spin-icon 0.8s linear infinite; }

        /* ── FAQ ── */
        .pr-faq {
          max-width: 680px; margin: 0 auto;
          padding: 0 24px 80px;
        }
        .pr-faq h2 {
          font-size: clamp(1.4rem, 3vw, 1.9rem);
          font-weight: 600; color: #fff;
          letter-spacing: -0.025em;
          text-align: center; margin-bottom: 36px;
        }

        /* ── FOOTER ── */
        .pr-footer {
          border-top: 1px solid #222;
          padding: 20px 28px;
        }
        .pr-footer-inner {
          max-width: 1060px; margin: 0 auto;
          display: flex; align-items: center;
          justify-content: space-between;
          flex-wrap: wrap; gap: 10px;
        }
        .pr-footer-left { display: flex; flex-direction: column; gap: 3px; }
        .pr-footer-copy { font-size: 11.5px; color: #3a3a3a; }
        .pr-footer-copy strong { color: #4a4a4a; font-weight: 600; }
        .pr-footer-email {
          font-size: 11.5px; color: #D4C5A0;
          text-decoration: none;
        }
        .pr-footer-email:hover { text-decoration: underline; }
        .pr-footer-right {
          display: flex; align-items: center; gap: 6px;
          font-size: 11.5px; color: #3a3a3a;
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 860px) {
          .pr-cards-grid {
            grid-template-columns: 1fr;
            border-radius: 14px;
          }
          .plan-card { border-right: none; border-bottom: 1px solid #2a2a2a; }
          .plan-card:last-child { border-bottom: none; }
          .pr-hero { padding: 52px 20px 40px; }
          .pr-cards-wrap { padding: 0 16px 60px; }
          .pr-faq { padding: 0 16px 60px; }
          .pr-footer { padding: 18px 20px; }
        }
        @media (max-width: 520px) {
          .pr-nav { padding: 12px 16px; }
          .plan-card { padding: 26px 20px 28px; }
          .pr-hero h1 { font-size: 1.65rem; }
        }
      `}</style>

      <div className="pr-root">
        {/* ── NAV ── */}
        <nav className="pr-nav">
          <Link href="/search" className="pr-logo">
            <div className="pr-logo-box">
              <BookOpen size={13} color="#0A0A0A" strokeWidth={2.5} />
            </div>
            <span className="pr-logo-text">Researchly</span>
          </Link>

          <div className="pr-nav-actions">
            <Link href="/search" className="pr-back-btn">
              <ArrowLeft size={13} /> Back to search
            </Link>
            {session ? (
              <Link href="/search" className="pr-open-btn">
                Open app
              </Link>
            ) : (
              <button className="pr-signin-btn" onClick={() => void signIn()}>
                Sign in
              </button>
            )}
          </div>
        </nav>

        {/* ── HERO ── */}
        <div className="pr-hero">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            Plans that grow with you
          </motion.h1>
        </div>

        {/* ── PLAN CARDS ── */}
        <div className="pr-cards-wrap" ref={cardsRef}>
          <div className="pr-cards-grid">
            {PLANS.map((plan, idx) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                idx={idx}
                onSubscribe={subscribe}
                paying={paying}
                popular={plan.id === "student"}
              />
            ))}
          </div>
        </div>

        {/* ── FAQ ── */}
        <motion.div
          className="pr-faq"
          ref={faqRef}
          initial={{ opacity: 0, y: 24 }}
          animate={faqInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2>Common questions</h2>
          <div style={{ borderTop: "1px solid #232323" }}>
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} {...faq} />
            ))}
          </div>
        </motion.div>

        {/* ── FOOTER ── */}
        <footer className="pr-footer">
          <div className="pr-footer-inner">
            <div className="pr-footer-left">
              <span className="pr-footer-copy">
                © 2026 Researchly · Built by <strong>Rahulkumar Pal</strong> ·
                Made in India 🇮🇳
              </span>
              <a
                href="mailto:hello.researchly@gmail.com"
                className="pr-footer-email"
              >
                hello.researchly@gmail.com
              </a>
            </div>
            <div className="pr-footer-right">
              <ShieldCheck size={12} style={{ color: "#5db87a" }} />
              Payments secured by Razorpay
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
