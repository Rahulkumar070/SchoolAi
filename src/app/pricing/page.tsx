"use client";
import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
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
    color: "#6b7280",
    checkColor: "#5db87a",
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
    period: "/month",
    desc: "For students & researchers",
    planId: process.env.NEXT_PUBLIC_RAZORPAY_STUDENT_PLAN_ID ?? "",
    planLabel: "Student Plan",
    highlight: true,
    icon: Sparkles,
    color: "#e8a045",
    checkColor: "#e8a045",
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
    period: "/month",
    desc: "For researchers & teams",
    planId: process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID ?? "",
    planLabel: "Pro Plan",
    highlight: false,
    icon: Crown,
    color: "#5c9ae0",
    checkColor: "#5c9ae0",
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
    <div
      style={{ borderBottom: "1px solid var(--border)", overflow: "hidden" }}
    >
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
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: 1.4,
          }}
        >
          {q}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: "var(--text-faint)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .2s",
          }}
        />
      </button>
      {open && (
        <p
          style={{
            fontSize: 13.5,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            paddingBottom: 18,
            paddingRight: 28,
          }}
        >
          {a}
        </p>
      )}
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
        theme: { color: "#e8a045" },
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
          background: "var(--bg)",
          minHeight: "100vh",
          fontFamily: "var(--font-ui)",
        }}
      >
        {/* ── Nav ─────────────────────────────────────────────── */}
        <nav
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "rgba(15,15,15,.92)",
            borderBottom: "1px solid var(--border)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            padding: "0 clamp(20px,4vw,48px)",
          }}
        >
          <div
            style={{
              maxWidth: 1080,
              margin: "0 auto",
              height: 60,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
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
                className="logo-mark"
                style={{ width: 28, height: 28, borderRadius: 7 }}
              >
                <BookOpen size={13} color="#000" strokeWidth={2.5} />
              </div>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 14.5,
                  color: "var(--text-primary)",
                }}
              >
                Researchly
              </span>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Link
                href="/search"
                style={{
                  fontSize: 13,
                  color: "var(--text-faint)",
                  padding: "6px 12px",
                  borderRadius: 8,
                  textDecoration: "none",
                  transition: "color .14s",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.color =
                    "var(--text-primary)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.color =
                    "var(--text-faint)")
                }
              >
                Search
              </Link>
              {session ? (
                <Link
                  href="/dashboard"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    padding: "7px 16px",
                    borderRadius: 9,
                    border: "1px solid var(--border-mid)",
                    textDecoration: "none",
                    transition: "border-color .14s, background .14s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "var(--border-hi)";
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--surface)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "var(--border-mid)";
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                  }}
                >
                  Dashboard
                </Link>
              ) : (
                <button
                  onClick={() => void signIn()}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#000",
                    padding: "7px 16px",
                    borderRadius: 9,
                    background: "var(--brand)",
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
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            padding: "72px clamp(20px,4vw,48px) 80px",
          }}
        >
          {/* ── Hero ────────────────────────────────────────────── */}
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 14px",
                borderRadius: 99,
                background: "var(--brand-dim)",
                border: "1px solid var(--brand-border)",
                fontSize: 11.5,
                fontWeight: 700,
                color: "var(--brand)",
                letterSpacing: ".06em",
                marginBottom: 20,
              }}
            >
              <Sparkles size={11} /> Simple pricing
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem,5.5vw,3.2rem)",
                fontWeight: 400,
                color: "var(--text-primary)",
                marginBottom: 16,
                lineHeight: 1.1,
                letterSpacing: "-.03em",
              }}
            >
              Research without limits
            </h1>
            <p
              style={{
                fontSize: 15.5,
                color: "var(--text-secondary)",
                maxWidth: 440,
                margin: "0 auto 28px",
                lineHeight: 1.72,
              }}
            >
              Pay instantly — UPI, card, net banking.
              <br />
              No emails, no waiting. Powered by Razorpay.
            </p>
            {/* Payment badges */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {[
                [Smartphone, "UPI / GPay / PhonePe"],
                [CreditCard, "Cards"],
                [Building2, "Net Banking"],
                [ShieldCheck, "Razorpay Secured"],
              ].map(([Ic, label]) => {
                const Icon = Ic as any;
                return (
                  <span
                    key={label as string}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px",
                      borderRadius: 99,
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                      color: "var(--text-faint)",
                      fontWeight: 500,
                    }}
                  >
                    <Icon size={11} style={{ color: "var(--brand)" }} />
                    {label as string}
                  </span>
                );
              })}
            </div>
          </div>

          {/* ── Plan Cards ──────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: 16,
              marginBottom: 72,
              alignItems: "start",
            }}
          >
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              const busy = paying === plan.id;
              return (
                <div
                  key={plan.id}
                  style={{
                    background: plan.highlight
                      ? "var(--bg-raised)"
                      : "var(--bg-raised)",
                    border: `1.5px solid ${plan.highlight ? plan.color + "45" : "var(--border)"}`,
                    borderRadius: 20,
                    padding: "28px 26px",
                    display: "flex",
                    flexDirection: "column",
                    position: "relative",
                    overflow: "hidden",
                    boxShadow: plan.highlight
                      ? `0 0 0 1px ${plan.color}22, 0 24px 60px rgba(0,0,0,.3)`
                      : "none",
                    transition:
                      "transform .2s, box-shadow .2s, border-color .2s",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = "translateY(-4px)";
                    el.style.boxShadow = plan.highlight
                      ? `0 0 0 1px ${plan.color}40, 0 28px 70px rgba(0,0,0,.4)`
                      : "0 16px 48px rgba(0,0,0,.35)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = "";
                    el.style.boxShadow = plan.highlight
                      ? `0 0 0 1px ${plan.color}22, 0 24px 60px rgba(0,0,0,.3)`
                      : "none";
                  }}
                >
                  {/* Glow blob */}
                  <div
                    style={{
                      position: "absolute",
                      top: -30,
                      right: -30,
                      width: 120,
                      height: 120,
                      borderRadius: "50%",
                      background: `${plan.color}10`,
                      filter: "blur(30px)",
                      pointerEvents: "none",
                    }}
                  />

                  {/* Popular badge */}
                  {plan.highlight && (
                    <div
                      style={{
                        position: "absolute",
                        top: 18,
                        right: 20,
                        padding: "3px 10px",
                        borderRadius: 99,
                        background: `${plan.color}18`,
                        border: `1px solid ${plan.color}35`,
                        fontSize: 10,
                        fontWeight: 800,
                        color: plan.color,
                        letterSpacing: ".06em",
                      }}
                    >
                      MOST POPULAR
                    </div>
                  )}

                  {/* Icon */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 13,
                      background: `${plan.color}14`,
                      border: `1px solid ${plan.color}28`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 16,
                    }}
                  >
                    <Icon size={20} style={{ color: plan.color }} />
                  </div>

                  {/* Name + desc */}
                  <p
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: 4,
                      letterSpacing: "-.02em",
                    }}
                  >
                    {plan.name}
                  </p>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-faint)",
                      marginBottom: 22,
                    }}
                  >
                    {plan.desc}
                  </p>

                  {/* Price */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: 4,
                      marginBottom: 24,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 46,
                        fontWeight: 700,
                        color: plan.highlight
                          ? plan.color
                          : "var(--text-primary)",
                        lineHeight: 1,
                        letterSpacing: "-2px",
                      }}
                    >
                      {plan.inr}
                    </span>
                    {plan.period && (
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--text-faint)",
                          paddingBottom: 6,
                        }}
                      >
                        {plan.period}
                      </span>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => void subscribe(plan)}
                    disabled={busy}
                    style={{
                      width: "100%",
                      padding: "13px 16px",
                      borderRadius: 12,
                      border: plan.highlight
                        ? "none"
                        : "1px solid var(--border-mid)",
                      background: plan.highlight
                        ? plan.color
                        : "var(--surface)",
                      color: plan.highlight ? "#000" : "var(--text-primary)",
                      fontFamily: "var(--font-ui)",
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: busy ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      opacity: busy ? 0.7 : 1,
                      transition: "all .15s",
                      marginBottom: 24,
                    }}
                    onMouseEnter={(e) => {
                      if (!busy) {
                        const el = e.currentTarget as HTMLElement;
                        if (plan.highlight)
                          el.style.filter = "brightness(1.08)";
                        else {
                          el.style.borderColor = "var(--border-hi)";
                          el.style.background = "var(--surface-2)";
                        }
                      }
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.filter = "";
                      if (!plan.highlight) {
                        el.style.borderColor = "var(--border-mid)";
                        el.style.background = "var(--surface)";
                      }
                    }}
                  >
                    {busy ? (
                      <>
                        <span
                          className="spinner"
                          style={{
                            width: 13,
                            height: 13,
                            borderTopColor: plan.highlight
                              ? "#000"
                              : "var(--brand)",
                          }}
                        />{" "}
                        Opening checkout…
                      </>
                    ) : (
                      <>
                        {plan.cta}{" "}
                        {!busy && plan.id !== "free" && (
                          <ArrowRight size={13} />
                        )}
                      </>
                    )}
                  </button>

                  {/* Divider */}
                  <div
                    style={{
                      height: 1,
                      background: "var(--border)",
                      marginBottom: 20,
                    }}
                  />

                  {/* Features */}
                  <ul
                    style={{
                      listStyle: "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: 11,
                      flex: 1,
                    }}
                  >
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          fontSize: 13.5,
                          color: "var(--text-secondary)",
                          lineHeight: 1.45,
                        }}
                      >
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 5,
                            background: `${plan.checkColor}14`,
                            border: `1px solid ${plan.checkColor}28`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          <Check size={10} style={{ color: plan.checkColor }} />
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* ── Trust strip ─────────────────────────────────────── */}
          <div
            style={{
              padding: "28px 32px",
              borderRadius: 16,
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: 32,
              marginBottom: 72,
              textAlign: "center",
            }}
          >
            {[
              {
                icon: ShieldCheck,
                color: "var(--green)",
                label: "PCI-DSS Certified",
                sub: "Bank-level security",
              },
              {
                icon: CreditCard,
                color: "var(--brand)",
                label: "All Payment Methods",
                sub: "UPI, Cards, Net Banking",
              },
              {
                icon: Zap,
                color: "#5c9ae0",
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
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    background: `${color}14`,
                    border: `1px solid ${color}28`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} style={{ color }} />
                </div>
                <div style={{ textAlign: "left" }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: 2,
                    }}
                  >
                    {label}
                  </p>
                  <p style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                    {sub}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ── FAQ ─────────────────────────────────────────────── */}
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
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
                  color: "var(--text-primary)",
                  letterSpacing: "-.025em",
                }}
              >
                Questions? Answered.
              </h2>
            </div>
            <div style={{ borderTop: "1px solid var(--border)" }}>
              {FAQS.map((faq) => (
                <FaqItem key={faq.q} {...faq} />
              ))}
            </div>
          </div>

          {/* ── Bottom CTA ──────────────────────────────────────── */}
          <div
            style={{
              textAlign: "center",
              marginTop: 72,
              padding: "52px 24px",
              borderRadius: 20,
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -40,
                left: "50%",
                transform: "translateX(-50%)",
                width: 300,
                height: 200,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(232,160,69,.1) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--text-faint)",
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
                color: "var(--text-primary)",
                marginBottom: 14,
                letterSpacing: "-.025em",
              }}
            >
              Ready to research smarter?
            </h3>
            <p
              style={{
                fontSize: 14.5,
                color: "var(--text-faint)",
                marginBottom: 28,
                lineHeight: 1.65,
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
                  gap: 8,
                  padding: "12px 24px",
                  borderRadius: 12,
                  background: "var(--brand)",
                  color: "#000",
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 4px 20px rgba(232,160,69,.25)",
                  transition: "transform .15s, box-shadow .15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform =
                    "translateY(-1px)";
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 8px 28px rgba(232,160,69,.35)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "";
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 4px 20px rgba(232,160,69,.25)";
                }}
              >
                Start for free <ArrowRight size={14} />
              </Link>
              <Link
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 22px",
                  borderRadius: 12,
                  border: "1px solid var(--border-mid)",
                  color: "var(--text-secondary)",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "border-color .14s, color .14s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "var(--border-hi)";
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "var(--border-mid)";
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--text-secondary)";
                }}
              >
                Learn more
              </Link>
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            padding: "20px clamp(20px,4vw,48px)",
          }}
        >
          <div
            style={{
              maxWidth: 1080,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                © 2026 Researchly · Built by{" "}
                <strong style={{ color: "var(--text-secondary)" }}>
                  Rahulkumar Pal
                </strong>{" "}
                · Made in India 🇮🇳
              </span>
              <a
                href="mailto:hello.researchly@gmail.com"
                style={{
                  fontSize: 11.5,
                  color: "var(--brand)",
                  textDecoration: "none",
                }}
              >
                hello.researchly@gmail.com
              </a>
            </div>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-faint)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ShieldCheck size={12} style={{ color: "var(--green)" }} />{" "}
              Payments secured by Razorpay
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
