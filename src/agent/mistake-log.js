// Item 053 · Mistake logger · appends to data/agent-index/mistakes/<named_agent>-<ix>.md

const fs = require("node:fs");
const path = require("node:path");

const MISTAKES_DIR = process.env.ASOLARIA_MISTAKES_DIR || "data/agent-index/mistakes";

function nextIx() {
  try {
    const files = fs.readdirSync(MISTAKES_DIR).filter(f => /^IX-\d+\.md$/.test(f));
    const max = files.reduce((m, f) => Math.max(m, parseInt(f.match(/IX-(\d+)/)[1], 10)), 0);
    return max + 1;
  } catch { return 1; }
}

function logMistake({ named_agent, mistake_class, summary, context = {}, chain = [] }) {
  if (!named_agent || !mistake_class || !summary) throw new Error("logMistake: named_agent, mistake_class, summary required");
  if (!fs.existsSync(MISTAKES_DIR)) fs.mkdirSync(MISTAKES_DIR, { recursive: true });
  const ix = nextIx();
  const name = `IX-${String(ix).padStart(4, "0")}.md`;
  const md = `---
ix: ${ix}
named_agent: ${named_agent}
mistake_class: ${mistake_class}
ts: ${new Date().toISOString()}
chain: [${chain.join(", ")}]
---

# ${summary}

\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`
`;
  fs.writeFileSync(path.join(MISTAKES_DIR, name), md);
  return { ix, path: path.join(MISTAKES_DIR, name) };
}

module.exports = { logMistake, MISTAKES_DIR };
