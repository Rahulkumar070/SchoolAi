"use client";
import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  BookOpen,
  Zap,
  Crown,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Smartphone,
  Building2,
  ArrowRight,
  ChevronDown,
  Loader2,
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
    inr: "₹0",
    period: "",
    desc: "Perfect to get started",
    planId: "",
    planLabel: "",
    highlight: false,
    icon: Zap,
    accentColor: "#555",
    features: [
      "5 AI searches / day",
      "Cited answers from 200M+ papers",
      "APA & MLA citations",
      "Save 20 papers",
      "1 PDF upload / month",
    ],
    cta: "Get started free",
  },
  {
    id: "student",
    name: "Student",
    inr: "₹199",
    period: "/mo",
    desc: "For students & researchers",
    planId: process.env.NEXT_PUBLIC_RAZORPAY_STUDENT_PLAN_ID ?? "",
    planLabel: "Student Plan",
    highlight: true,
    icon: Sparkles,
    accentColor: "#c9b99a",
    features: [
      "500 searches / month",
      "Full literature reviews",
      "All 6 citation formats",
      "20 PDF uploads / month",
      "Unlimited paper library",
      "Search history",
      "Priority Claude AI",
    ],
    cta: "Subscribe — ₹199/mo",
  },
  {
    id: "pro",
    name: "Pro",
    inr: "₹499",
    period: "/mo",
    desc: "For researchers & teams",
    planId: process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID ?? "",
    planLabel: "Pro Plan",
    highlight: false,
    icon: Crown,
    accentColor: "#7ea8c9",
    features: [
      "Unlimited searches",
      "Unlimited PDF uploads",
      "Research gap analysis",
      "API access (100 req/day)",
      "Team sharing (5 seats)",
      "Priority email support",
      "Early feature access",
    ],
    cta: "Subscribe — ₹499/mo",
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
    <div style={{ borderBottom: "1px solid #222" }}>
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
          fontFamily: "var(--font-ui)",
          textAlign: "left",
          gap: 16,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "#e8e3dc",
            lineHeight: 1.4,
          }}
        >
          {q}
        </span>
        <ChevronDown
          size={15}
          style={{
            color: "#555",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .2s",
          }}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{
              fontSize: 13.5,
              color: "#888",
              lineHeight: 1.75,
              paddingBottom: 18,
              paddingRight: 28,
              overflow: "hidden",
            }}
          >
            {a}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Pricing() {
  const { data: session } = useSession();
  const router = useRouter();
  const [paying, setPaying] = useState("");

  const subscribe = async (plan: (typeof PLANS)[0]) => {
    if (plan.id === "free") {
      router.push(session ? "/search" : "/auth/signin");
      return;
    }
    if (!session) {
      void signIn();
      return;
    }
    if (!plan.planId) {
      toast.error(
        "Payment not configured. Add NEXT_PUBLIC_RAZORPAY_STUDENT_PLAN_ID to .env",
      );
      return;
    }
    setPaying(plan.id);
    try {
      const r = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.planId, planName: plan.planLabel }),
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
        theme: { color: "#c9b99a" },
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
  };

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
      />

      <div
        style={{
          background: "#141414",
          minHeight: "100vh",
          fontFamily: "var(--font-ui)",
          color: "#e8e3dc",
        }}
      >
        {/* ── Nav ── */}
        <nav
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "rgba(20,20,20,.9)",
            borderBottom: "1px solid #1e1e1e",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <div
            style={{
              maxWidth: 900,
              margin: "0 auto",
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 24px",
            }}
          >
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: "#c9b99a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BookOpen size={12} color="#000" strokeWidth={2.5} />
              </div>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#e8e3dc",
                  letterSpacing: "-.01em",
                }}
              >
                Researchly
              </span>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Link
                href="/search"
                style={{
                  fontSize: 13,
                  color: "#555",
                  padding: "5px 10px",
                  borderRadius: 7,
                  textDecoration: "none",
                  transition: "color .14s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#e8e3dc")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
              >
                Search
              </Link>
              {session ? (
                <Link
                  href="/search"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#e8e3dc",
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "1px solid #252525",
                    textDecoration: "none",
                    transition: "border-color .14s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = "#3a3a3a")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = "#252525")
                  }
                >
                  Open app
                </Link>
              ) : (
                <button
                  onClick={() => void signIn()}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#000",
                    padding: "6px 14px",
                    borderRadius: 8,
                    background: "#c9b99a",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        </nav>

        <div
          style={{ maxWidth: 900, margin: "0 auto", padding: "72px 24px 96px" }}
        >
          {/* ── Hero ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{ textAlign: "center", marginBottom: 64 }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                borderRadius: 99,
                background: "rgba(201,185,154,.08)",
                border: "1px solid rgba(201,185,154,.18)",
                fontSize: 11,
                fontWeight: 700,
                color: "#c9b99a",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                marginBottom: 22,
              }}
            >
              <Sparkles size={10} /> Simple pricing
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.2rem,5vw,3.4rem)",
                fontWeight: 400,
                color: "#e8e3dc",
                marginBottom: 14,
                lineHeight: 1.08,
                letterSpacing: "-.04em",
              }}
            >
              Research without limits
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "#666",
                maxWidth: 380,
                margin: "0 auto 28px",
                lineHeight: 1.75,
                fontWeight: 300,
              }}
            >
              Pay instantly — UPI, cards, net banking. No emails, no waiting.
            </p>
            {/* Payment method pills */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {(
                [
                  [Smartphone, "UPI / GPay"],
                  [CreditCard, "Cards"],
                  [Building2, "Net Banking"],
                  [ShieldCheck, "Razorpay Secured"],
                ] as const
              ).map(([Ic, label]) => {
                const Icon = Ic as any;
                return (
                  <span
                    key={label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 11px",
                      borderRadius: 99,
                      background: "#1a1a1a",
                      border: "1px solid #222",
                      fontSize: 11.5,
                      color: "#555",
                      fontWeight: 500,
                    }}
                  >
                    <Icon size={10} style={{ color: "#c9b99a" }} />
                    {label}
                  </span>
                );
              })}
            </div>
          </motion.div>

          {/* ── Plan Cards ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
              marginBottom: 72,
              alignItems: "start",
            }}
          >
            {PLANS.map((plan, idx) => {
              const Icon = plan.icon;
              const busy = paying === plan.id;
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + idx * 0.07 }}
                  style={{
                    background: plan.highlight ? "#1a1a1a" : "#181818",
                    border: `1px solid ${plan.highlight ? "rgba(201,185,154,.25)" : "#1e1e1e"}`,
                    borderRadius: 18,
                    padding: "26px 24px",
                    display: "flex",
                    flexDirection: "column",
                    position: "relative",
                    overflow: "hidden",
                    boxShadow: plan.highlight
                      ? "0 0 0 1px rgba(201,185,154,.08), 0 20px 50px rgba(0,0,0,.35)"
                      : "none",
                    transition:
                      "transform .2s, box-shadow .2s, border-color .2s",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = "translateY(-3px)";
                    el.style.boxShadow = plan.highlight
                      ? "0 0 0 1px rgba(201,185,154,.3), 0 28px 60px rgba(0,0,0,.45)"
                      : "0 16px 40px rgba(0,0,0,.4)";
                    el.style.borderColor = plan.highlight
                      ? "rgba(201,185,154,.35)"
                      : "#2a2a2a";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = "";
                    el.style.boxShadow = plan.highlight
                      ? "0 0 0 1px rgba(201,185,154,.08), 0 20px 50px rgba(0,0,0,.35)"
                      : "none";
                    el.style.borderColor = plan.highlight
                      ? "rgba(201,185,154,.25)"
                      : "#1e1e1e";
                  }}
                >
                  {/* Subtle glow blob */}
                  <div
                    style={{
                      position: "absolute",
                      top: -40,
                      right: -40,
                      width: 130,
                      height: 130,
                      borderRadius: "50%",
                      background: `${plan.accentColor}0a`,
                      filter: "blur(40px)",
                      pointerEvents: "none",
                    }}
                  />

                  {/* Popular badge */}
                  {plan.highlight && (
                    <div
                      style={{
                        position: "absolute",
                        top: 16,
                        right: 18,
                        padding: "2px 9px",
                        borderRadius: 99,
                        background: "rgba(201,185,154,.1)",
                        border: "1px solid rgba(201,185,154,.22)",
                        fontSize: 9.5,
                        fontWeight: 800,
                        color: "#c9b99a",
                        letterSpacing: ".1em",
                      }}
                    >
                      POPULAR
                    </div>
                  )}

                  {/* Icon */}
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      background: `${plan.accentColor}12`,
                      border: `1px solid ${plan.accentColor}20`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 14,
                    }}
                  >
                    <Icon size={17} style={{ color: plan.accentColor }} />
                  </div>

                  {/* Name + desc */}
                  <p
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#e8e3dc",
                      marginBottom: 3,
                      letterSpacing: "-.02em",
                    }}
                  >
                    {plan.name}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: "#444",
                      marginBottom: 20,
                      fontWeight: 400,
                    }}
                  >
                    {plan.desc}
                  </p>

                  {/* Price */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: 3,
                      marginBottom: 22,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 44,
                        fontWeight: 700,
                        color: plan.highlight ? "#c9b99a" : "#e8e3dc",
                        lineHeight: 1,
                        letterSpacing: "-2px",
                      }}
                    >
                      {plan.inr}
                    </span>
                    {plan.period && (
                      <span
                        style={{
                          fontSize: 12,
                          color: "#444",
                          paddingBottom: 6,
                        }}
                      >
                        {plan.period}
                      </span>
                    )}
                  </div>

                  {/* CTA button */}
                  <button
                    onClick={() => void subscribe(plan)}
                    disabled={busy}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 11,
                      border: plan.highlight ? "none" : "1px solid #252525",
                      background: plan.highlight ? "#c9b99a" : "#1e1e1e",
                      color: plan.highlight ? "#000" : "#e8e3dc",
                      fontFamily: "var(--font-ui)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: busy ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      opacity: busy ? 0.7 : 1,
                      transition: "all .14s",
                      marginBottom: 22,
                    }}
                    onMouseEnter={(e) => {
                      if (busy) return;
                      const el = e.currentTarget as HTMLElement;
                      if (plan.highlight) el.style.filter = "brightness(1.07)";
                      else {
                        el.style.borderColor = "#333";
                        el.style.background = "#232323";
                      }
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.filter = "";
                      if (!plan.highlight) {
                        el.style.borderColor = "#252525";
                        el.style.background = "#1e1e1e";
                      }
                    }}
                  >
                    {busy ? (
                      <>
                        <Loader2
                          size={13}
                          style={{ animation: "spin 0.7s linear infinite" }}
                        />{" "}
                        Opening checkout…
                      </>
                    ) : (
                      <>
                        {plan.cta}
                        {plan.id !== "free" && <ArrowRight size={12} />}
                      </>
                    )}
                  </button>

                  {/* Divider */}
                  <div
                    style={{
                      height: 1,
                      background: "#1e1e1e",
                      marginBottom: 18,
                    }}
                  />

                  {/* Features */}
                  <ul
                    style={{
                      listStyle: "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      flex: 1,
                    }}
                  >
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 9,
                          fontSize: 13,
                          color: "#888",
                          lineHeight: 1.45,
                        }}
                      >
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 5,
                            background: `${plan.accentColor}12`,
                            border: `1px solid ${plan.accentColor}22`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          <Check size={9} style={{ color: plan.accentColor }} />
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              );
            })}
          </motion.div>

          {/* ── Trust strip ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.4 }}
            style={{
              padding: "24px 28px",
              borderRadius: 14,
              background: "#181818",
              border: "1px solid #1e1e1e",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: 28,
              marginBottom: 72,
            }}
          >
            {[
              {
                icon: ShieldCheck,
                color: "#5db87a",
                label: "PCI-DSS Certified",
                sub: "Bank-level security",
              },
              {
                icon: CreditCard,
                color: "#c9b99a",
                label: "All Payment Methods",
                sub: "UPI, Cards, Net Banking",
              },
              {
                icon: Zap,
                color: "#7ea8c9",
                label: "Instant Activation",
                sub: "Access within seconds",
              },
              {
                icon: Sparkles,
                color: "#ad73e0",
                label: "14-Day Guarantee",
                sub: "Full refund, no questions",
              },
            ].map(({ icon: Icon, color, label, sub }) => (
              <div
                key={label}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${color}10`,
                    border: `1px solid ${color}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} style={{ color }} />
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "#e8e3dc",
                      marginBottom: 1,
                    }}
                  >
                    {label}
                  </p>
                  <p style={{ fontSize: 11, color: "#444" }}>{sub}</p>
                </div>
              </div>
            ))}
          </motion.div>

          {/* ── FAQ ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.5 }}
            style={{ maxWidth: 640, margin: "0 auto 72px" }}
          >
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <p
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "1.6px",
                  textTransform: "uppercase",
                  color: "#444",
                  marginBottom: 12,
                }}
              >
                FAQ
              </p>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(1.4rem,3vw,1.8rem)",
                  fontWeight: 400,
                  color: "#e8e3dc",
                  letterSpacing: "-.03em",
                }}
              >
                Questions? Answered.
              </h2>
            </div>
            <div style={{ borderTop: "1px solid #1e1e1e" }}>
              {FAQS.map((faq) => (
                <FaqItem key={faq.q} {...faq} />
              ))}
            </div>
          </motion.div>

          {/* ── Bottom CTA ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.6 }}
            style={{
              textAlign: "center",
              padding: "52px 24px",
              borderRadius: 18,
              background: "#181818",
              border: "1px solid #1e1e1e",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Glow */}
            <div
              style={{
                position: "absolute",
                top: -60,
                left: "50%",
                transform: "translateX(-50%)",
                width: 320,
                height: 220,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(201,185,154,.07) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />

            <p
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "1.6px",
                textTransform: "uppercase",
                color: "#444",
                marginBottom: 14,
              }}
            >
              Get started today
            </p>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.5rem,3.5vw,2.2rem)",
                fontWeight: 400,
                color: "#e8e3dc",
                marginBottom: 12,
                letterSpacing: "-.03em",
              }}
            >
              Ready to research smarter?
            </h3>
            <p
              style={{
                fontSize: 14,
                color: "#555",
                marginBottom: 28,
                lineHeight: 1.7,
                fontWeight: 300,
              }}
            >
              Join 10,000+ students and researchers. Start free, upgrade
              anytime.
            </p>
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Link
                href={session ? "/search" : "/auth/signin"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "11px 22px",
                  borderRadius: 11,
                  background: "#c9b99a",
                  color: "#000",
                  fontSize: 13.5,
                  fontWeight: 700,
                  textDecoration: "none",
                  transition: "filter .14s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.filter = "brightness(1.07)")
                }
                onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
              >
                Start for free <ArrowRight size={13} />
              </Link>
              <Link
                href="/search"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "11px 20px",
                  borderRadius: 11,
                  border: "1px solid #252525",
                  color: "#888",
                  fontSize: 13.5,
                  fontWeight: 500,
                  textDecoration: "none",
                  transition: "border-color .14s, color .14s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#333";
                  e.currentTarget.style.color = "#e8e3dc";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#252525";
                  e.currentTarget.style.color = "#888";
                }}
              >
                Try for free
              </Link>
            </div>
          </motion.div>
        </div>

        {/* ── Footer ── */}
        <footer
          style={{ borderTop: "1px solid #1a1a1a", padding: "20px 24px" }}
        >
          <div
            style={{
              maxWidth: 900,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 12, color: "#3a3a3a" }}>
                © 2026 Researchly · Built by{" "}
                <strong style={{ color: "#555" }}>Rahulkumar Pal</strong> · Made
                in India 🇮🇳
              </span>
              <a
                href="mailto:hello.researchly@gmail.com"
                style={{
                  fontSize: 11.5,
                  color: "#c9b99a",
                  textDecoration: "none",
                }}
              >
                hello.researchly@gmail.com
              </a>
            </div>
            <span
              style={{
                fontSize: 12,
                color: "#3a3a3a",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ShieldCheck size={11} style={{ color: "#5db87a" }} /> Payments
              secured by Razorpay
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
