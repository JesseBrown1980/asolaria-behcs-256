const { runGeminiApiExplainFile } = require("../src/connectors/geminiApiConnector");

function parseArgs(argv) {
  const out = {
    filePath: "",
    prompt: "",
    model: "",
    keepRemoteFile: false
  };
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  for (let index = 0; index < args.length; index += 1) {
    const value = String(args[index] || "").trim();
    if (!value) continue;
    if ((value === "--file" || value === "-f") && args[index + 1]) {
      out.filePath = String(args[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if ((value === "--prompt" || value === "-p") && args[index + 1]) {
      out.prompt = String(args[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if ((value === "--model" || value === "-m") && args[index + 1]) {
      out.model = String(args[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (value === "--keep-remote-file") {
      out.keepRemoteFile = true;
      continue;
    }
    if (!out.filePath) {
      out.filePath = value;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await runGeminiApiExplainFile({
    filePath: args.filePath,
    prompt: args.prompt,
    model: args.model,
    keepRemoteFile: args.keepRemoteFile
  }, {
    enabled: true
  });
  process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.message || error)}\n`);
  process.exit(1);
});
