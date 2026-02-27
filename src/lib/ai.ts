import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Paper, ChatMessage } from "@/types";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function ctx(papers: Paper[]) {
  return papers.slice(0, 12).map((p, i) => `[${i+1}] "${p.title}"\nAuthors: ${p.authors.slice(0,4).join(", ")}${p.authors.length>4?" et al.":""} | Year: ${p.year ?? "n.d."} | Source: ${p.journal ?? p.source}\nAbstract: ${p.abstract.slice(0, 550)}`).join("\n\n---\n\n");
}

async function callAI(sys: string, usr: string, maxT: number): Promise<string> {
  try {
    const r = await ant.messages.create({ model: "claude-opus-4-6", max_tokens: maxT, system: sys, messages: [{ role: "user", content: usr }] });
    const b = r.content[0]; return b.type === "text" ? b.text : "";
  } catch {
    const r = await oai.chat.completions.create({ model: "gpt-4o", max_tokens: maxT, messages: [{ role: "system", content: sys }, { role: "user", content: usr }] });
    return r.choices[0].message.content ?? "";
  }
}

export async function generateAnswer(query: string, papers: Paper[]) {
  return callAI(
    "You are an expert academic research assistant. Synthesise answers from the given papers only. Place inline citations [1][2] after every factual claim. Use clean markdown.",
    `QUESTION: "${query}"\n\nSOURCES:\n${ctx(papers)}\n\nWrite a comprehensive 4-6 paragraph answer with [n] citations after every claim. End with ## Key Takeaways (3-4 bullet points).`,
    2200
  );
}

export async function generateReview(topic: string, papers: Paper[]) {
  return callAI(
    "You are an expert academic writer. Write formal literature reviews. Cite with [1][2] inline. Use clean markdown.",
    `TOPIC: "${topic}"\n\nSOURCES:\n${ctx(papers)}\n\nWrite a full literature review with sections:\n## Introduction\n## Theoretical Background\n## Key Findings\n## Debates & Contradictions\n## Research Gaps\n## Conclusion\n\nEach section 2-3 paragraphs. Every claim cited. ~1300 words.`,
    3800
  );
}

export async function chatPDF(question: string, pdfText: string, history: ChatMessage[]) {
  const sys = `You are an expert academic assistant helping analyse a paper.\n\nPAPER:\n${pdfText.slice(0, 13000)}\n\nAnswer based only on this paper. Quote passages when helpful. If not in paper, say so.`;
  try {
    const r = await ant.messages.create({ model: "claude-opus-4-6", max_tokens: 1600, system: sys, messages: [...history.slice(-8).map(m => ({ role: m.role as "user"|"assistant", content: m.content })), { role: "user", content: question }] });
    const b = r.content[0]; return b.type === "text" ? b.text : "";
  } catch {
    const r = await oai.chat.completions.create({ model: "gpt-4o", max_tokens: 1600, messages: [{ role: "system", content: sys }, ...history.slice(-8).map(m => ({ role: m.role as "user"|"assistant", content: m.content })), { role: "user", content: question }] });
    return r.choices[0].message.content ?? "";
  }
}
