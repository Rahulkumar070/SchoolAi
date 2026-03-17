import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#111110",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Georgia, serif",
        }}
      >
        {/* Logo + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              background: "#7c3aed",
              borderRadius: 20,
              width: 96,
              height: 96,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              fontWeight: 900,
              color: "#ffffff",
              letterSpacing: "-1px",
            }}
          >
            [R]
          </div>
          <div
            style={{
              fontSize: 80,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-2px",
            }}
          >
            Researchly
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "#888880",
            marginTop: 28,
            letterSpacing: "0.01em",
          }}
        >
          AI-powered academic research · 200M+ papers
        </div>

        {/* Domain */}
        <div
          style={{
            fontSize: 22,
            color: "#7c3aed",
            marginTop: 20,
            fontWeight: 600,
          }}
        >
          researchly.in
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
