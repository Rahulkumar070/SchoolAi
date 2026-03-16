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
  ChevronDown,
  Loader2,
  ArrowLeft,
  Zap,
  GraduationCap,
  Crown,
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
    popular: false,
    Icon: Zap,
    accentColor: "var(--text-muted)",
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
    period: "/ month",
    planId: process.env.NEXT_PUBLIC_RAZORPAY_STUDENT_PLAN_ID ?? "",
    planLabel: "Student Plan",
    ctaText: "Upgrade",
    ctaStyle: "solid" as const,
    popular: true,
    Icon: GraduationCap,
    accentColor: "var(--brand)",
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
    period: "/ month",
    planId: process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID ?? "",
    planLabel: "Pro Plan",
    ctaText: "Upgrade",
    ctaStyle: "outline" as const,
    popular: false,
    Icon: Crown,
    accentColor: "#7ea8c9",
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
    q: "What counts as a search?",
    a: "Each time you submit a question and receive an AI-generated answer with cited papers, that counts as one search. Browsing previously saved results or viewing your library does not consume searches.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your dashboard in one click. Your plan stays active until the end of the current billing period, then automatically reverts to Free — no questions asked.",
  },
  {
    q: "What payment methods are accepted?",
    a: "We accept all major credit and debit cards (Visa, Mastercard, RuPay), UPI, net banking, and popular wallets — all processed securely through Razorpay.",
  },
  {
    q: "Do I lose my search history if I downgrade?",
    a: "No. Your saved papers and search history remain intact when you downgrade. You simply return to the Free plan limits for new searches going forward.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pr-faq-item">
      <button className="pr-faq-btn" onClick={() => setOpen((o) => !o)}>
        <span className="pr-faq-q">{q}</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={14} className="pr-faq-chevron" />
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
            <p className="pr-faq-a">{a}</p>
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
  userPlan,
}: {
  plan: (typeof PLANS)[0];
  idx: number;
  onSubscribe: (p: (typeof PLANS)[0]) => void;
  paying: string;
  userPlan: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const busy = paying === plan.id;
  const { Icon } = plan;
  const isCurrent = userPlan === plan.id;
  const ctaLabel = isCurrent ? "Current Plan" : plan.ctaText;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.45,
        delay: idx * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={`pr-plan-card${plan.popular ? " pr-plan-card--popular" : ""}`}
    >
      {plan.popular && <div className="pr-popular-badge">Most Popular</div>}

      {/* Icon + name */}
      <div className="pr-card-header">
        <div
          className="pr-card-icon"
          style={{
            background: plan.popular ? "var(--brand-dim)" : "var(--surface)",
            border: plan.popular
              ? "1px solid var(--brand-border)"
              : "1px solid var(--border-mid)",
          }}
        >
          <Icon
            size={18}
            style={{ color: plan.popular ? "var(--brand)" : plan.accentColor }}
          />
        </div>
        <div>
          <h3 className="pr-plan-name">{plan.name}</h3>
          <p className="pr-plan-desc">{plan.desc}</p>
        </div>
      </div>

      {/* Price */}
      <div className="pr-price-row">
        <span className="pr-price">{plan.inr}</span>
        {plan.period && (
          <div className="pr-period">
            <span>INR{plan.period}</span>
            <span className="pr-period-sub">billed monthly</span>
          </div>
        )}
      </div>

      {/* CTA */}
      <button
        className={`pr-cta-btn pr-cta-btn--${plan.ctaStyle}${isCurrent ? " pr-cta-btn--current" : ""}`}
        onClick={() => !isCurrent && onSubscribe(plan)}
        disabled={busy || isCurrent}
      >
        {busy ? (
          <>
            <Loader2 size={13} className="pr-spin" /> Opening checkout…
          </>
        ) : (
          ctaLabel
        )}
      </button>

      {/* Divider */}
      <div className="pr-card-divider" />

      {/* Features */}
      <ul className="pr-features">
        {plan.features.map((f) => (
          <li key={f} className="pr-feature-item">
            <Check
              size={13}
              className="pr-feature-check"
              style={{
                color: plan.popular ? "var(--brand)" : "var(--text-muted)",
              }}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export default function Pricing() {
  const { data: session } = useSession();
  const router = useRouter();
  const userPlan = session?.user?.plan ?? "free";
  const [paying, setPaying] = useState("");

  const faqRef = useRef(null);
  const faqInView = useInView(faqRef, { once: true, margin: "-40px" });

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
          theme: { color: "var(--brand)" },
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
        /* ── Root ── */
        .pr-root {
          min-height: 100vh;
          background: var(--bg, #0f0f0f);
          font-family: -apple-system, 'Inter', BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: var(--text-primary, #e8e3dc);
          transition: background 0.22s, color 0.22s;
        }

        /* ── NAV ── */
        .pr-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 28px;
          border-bottom: 1px solid var(--border);
          position: sticky; top: 0; z-index: 50;
          background: var(--bg-raised);
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
        }
        .pr-logo-text {
          font-size: 15px; font-weight: 600;
          color: var(--text-primary); letter-spacing: -0.01em;
        }
        .pr-nav-actions { display: flex; align-items: center; gap: 8px; }
        .pr-back-btn {
          display: flex; align-items: center; gap: 6px;
          background: none; border: none; cursor: pointer;
          color: var(--text-muted); font-size: 13px; font-family: inherit;
          padding: 6px 10px; border-radius: 8px;
          transition: color 0.15s, background 0.15s;
          text-decoration: none;
        }
        .pr-back-btn:hover { color: var(--text-primary); background: var(--surface); }
        .pr-signin-btn {
          font-size: 13px; font-weight: 600;
          color: var(--brand-fg, #000);
          padding: 7px 16px; border-radius: 8px;
          background: var(--brand); border: none;
          cursor: pointer; font-family: inherit;
          transition: background 0.15s;
        }
        .pr-signin-btn:hover { background: var(--brand-hover, #b8a589); }
        .pr-open-btn {
          font-size: 13px; font-weight: 500; color: var(--text-secondary);
          padding: 7px 16px; border-radius: 8px;
          background: var(--surface);
          border: 1px solid var(--border-mid); cursor: pointer;
          font-family: inherit; text-decoration: none;
          display: inline-flex; align-items: center;
          transition: background 0.15s;
        }
        .pr-open-btn:hover { background: var(--surface-2); }

        /* ── HERO ── */
        .pr-hero {
          text-align: center;
          padding: 64px 24px 48px;
          max-width: 700px;
          margin: 0 auto;
        }
        .pr-hero h1 {
          font-size: clamp(1.8rem, 4vw, 2.6rem);
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.035em;
          line-height: 1.15;
          margin-bottom: 14px;
        }
        .pr-hero p {
          font-size: 15px;
          color: var(--text-muted);
          line-height: 1.6;
          max-width: 440px;
          margin: 0 auto;
        }

        /* ── PLAN CARDS GRID ── */
        .pr-cards-wrap {
          max-width: 1080px;
          margin: 0 auto;
          padding: 0 24px 80px;
        }
        .pr-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          align-items: start;
        }

        /* ── INDIVIDUAL CARD ── */
        .pr-plan-card {
          position: relative;
          padding: 28px 26px 32px;
          border-radius: 20px;
          background: var(--bg-raised);
          border: 1px solid var(--border-mid);
          display: flex; flex-direction: column;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
        }
        .pr-plan-card:hover {
          border-color: var(--border-hi);
          transform: translateY(-3px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.12);
        }
        .pr-plan-card--popular {
          border-color: var(--brand-border);
          background: var(--bg-raised);
          box-shadow: 0 0 0 1px var(--brand-border), 0 8px 32px rgba(0,0,0,0.1);
        }
        .pr-plan-card--popular:hover {
          border-color: var(--brand);
          box-shadow: 0 0 0 1px var(--brand), 0 20px 56px rgba(0,0,0,0.14);
        }

        /* Popular badge */
        .pr-popular-badge {
          position: absolute;
          top: -13px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--brand);
          color: var(--brand-fg, #000);
          font-size: 11px;
          font-weight: 700;
          padding: 3px 14px;
          border-radius: 99px;
          white-space: nowrap;
          letter-spacing: 0.04em;
        }

        /* Card header */
        .pr-card-header {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 20px;
        }
        .pr-card-icon {
          width: 40px; height: 40px; border-radius: 11px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .pr-plan-name {
          font-size: 17px; font-weight: 700;
          color: var(--text-primary); letter-spacing: -0.02em;
          margin: 0 0 3px;
        }
        .pr-plan-desc {
          font-size: 12.5px; color: var(--text-muted);
          margin: 0; line-height: 1.4;
        }

        /* Price */
        .pr-price-row {
          display: flex; align-items: flex-end;
          gap: 8px; margin-bottom: 22px;
        }
        .pr-price {
          font-size: 44px; font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -2.5px; line-height: 1;
        }
        .pr-period {
          display: flex; flex-direction: column;
          font-size: 11px; color: var(--text-muted);
          padding-bottom: 6px; line-height: 1.5;
        }
        .pr-period-sub { color: var(--text-faint); }

        /* CTA buttons */
        .pr-cta-btn {
          width: 100%; padding: 12px 16px;
          border-radius: 10px; font-family: inherit;
          font-size: 14px; font-weight: 600;
          cursor: pointer; display: flex;
          align-items: center; justify-content: center; gap: 7px;
          margin-bottom: 24px;
          transition: background 0.15s, opacity 0.15s, border-color 0.15s;
        }
        .pr-cta-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .pr-cta-btn--solid {
          background: var(--brand);
          color: var(--brand-fg, #000);
          border: none;
        }
        .pr-cta-btn--solid:hover:not(:disabled) {
          background: var(--brand-hover, #b8a589);
        }
        .pr-cta-btn--ghost {
          background: var(--surface);
          color: var(--text-secondary);
          border: 1px solid var(--border-mid);
        }
        .pr-cta-btn--ghost:hover:not(:disabled) {
          background: var(--surface-2);
          border-color: var(--border-hi);
          color: var(--text-primary);
        }
        .pr-cta-btn--outline {
          background: transparent;
          color: #7ea8c9;
          border: 1px solid rgba(126,168,201,0.3);
        }
        .pr-cta-btn--outline:hover:not(:disabled) {
          background: rgba(126,168,201,0.07);
          border-color: rgba(126,168,201,0.55);
        }
        .pr-cta-btn--current {
          background: transparent !important;
          color: var(--text-muted) !important;
          border: 1px solid var(--border-mid) !important;
          cursor: default !important;
          opacity: 0.7 !important;
        }

        /* Divider */
        .pr-card-divider {
          height: 1px; background: var(--border);
          margin-bottom: 20px;
        }

        /* Features */
        .pr-features {
          list-style: none; padding: 0; margin: 0;
          display: flex; flex-direction: column;
          gap: 11px; flex: 1;
        }
        .pr-feature-item {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 13px; color: var(--text-secondary); line-height: 1.45;
        }
        .pr-feature-check { flex-shrink: 0; margin-top: 1px; }

        @keyframes pr-spin { to { transform: rotate(360deg); } }
        .pr-spin { animation: pr-spin 0.8s linear infinite; }

        /* ── FAQ ── */
        .pr-faq {
          max-width: 660px; margin: 0 auto;
          padding: 0 24px 80px;
        }
        .pr-faq-title {
          font-size: clamp(1.3rem, 3vw, 1.75rem);
          font-weight: 700; color: var(--text-primary);
          letter-spacing: -0.025em;
          text-align: center; margin-bottom: 32px;
        }
        .pr-faq-list { border-top: 1px solid var(--border); }
        .pr-faq-item { border-bottom: 1px solid var(--border); }
        .pr-faq-btn {
          width: 100%;
          display: flex; align-items: center;
          justify-content: space-between;
          padding: 18px 0;
          background: transparent; border: none;
          cursor: pointer; font-family: inherit;
          text-align: left; gap: 16px;
        }
        .pr-faq-q {
          font-size: 14px; font-weight: 500;
          color: var(--text-secondary); line-height: 1.5;
        }
        .pr-faq-chevron { color: var(--text-muted); flex-shrink: 0; }
        .pr-faq-a {
          font-size: 13.5px; color: var(--text-muted);
          line-height: 1.75; padding-bottom: 18px;
          padding-right: 28px; margin: 0;
        }

        /* ── FOOTER ── */
        .pr-footer {
          border-top: 1px solid var(--border);
          padding: 20px 28px;
        }
        .pr-footer-inner {
          max-width: 1080px; margin: 0 auto;
          display: flex; align-items: center;
          justify-content: space-between;
          flex-wrap: wrap; gap: 10px;
        }
        .pr-footer-left { display: flex; flex-direction: column; gap: 3px; }
        .pr-footer-copy { font-size: 11.5px; color: var(--text-faint); }
        .pr-footer-copy strong { color: var(--text-muted); font-weight: 600; }
        .pr-footer-email {
          font-size: 11.5px; color: var(--brand);
          text-decoration: none;
        }
        .pr-footer-email:hover { text-decoration: underline; }
        .pr-footer-right {
          display: flex; align-items: center; gap: 6px;
          font-size: 11.5px; color: var(--text-faint);
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 900px) {
          .pr-cards-grid {
            grid-template-columns: 1fr;
            max-width: 480px;
            margin: 0 auto;
          }
          .pr-plan-card--popular { margin-top: 12px; }
          .pr-hero { padding: 48px 20px 36px; }
          .pr-cards-wrap { padding: 0 20px 60px; }
          .pr-faq { padding: 0 20px 60px; }
        }
        @media (min-width: 600px) and (max-width: 900px) {
          .pr-cards-grid {
            grid-template-columns: repeat(2, 1fr);
            max-width: 100%;
          }
          .pr-plan-card--popular {
            grid-column: 1 / -1;
            max-width: 480px;
            margin: 0 auto;
            width: 100%;
          }
        }
        @media (max-width: 480px) {
          .pr-nav { padding: 12px 16px; }
          .pr-plan-card { padding: 24px 20px 28px; }
          .pr-price { font-size: 38px; }
          .pr-hero h1 { font-size: 1.6rem; }
          .pr-footer { padding: 18px 16px; }
        }
      `}</style>

      <div className="pr-root">
        {/* ── NAV ── */}
        <nav className="pr-nav">
          <Link href="/search" className="pr-logo">
            <div className="pr-logo-box">
              <BookOpen
                size={14}
                style={{ color: "var(--brand-fg, #000)" }}
                strokeWidth={2.5}
              />
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
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            Search 200M+ academic papers, generate literature reviews, and chat
            with PDFs.
          </motion.p>
        </div>

        {/* ── PLAN CARDS ── */}
        <div className="pr-cards-wrap">
          <div className="pr-cards-grid">
            {PLANS.map((plan, idx) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                idx={idx}
                onSubscribe={subscribe}
                paying={paying}
                userPlan={userPlan}
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
          <h2 className="pr-faq-title">Common questions</h2>
          <div className="pr-faq-list">
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
