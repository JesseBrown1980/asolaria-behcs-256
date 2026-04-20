const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { resolveToolPaths } = require("./systemPaths");

// Persistent PID registry integration (LX-249 universal auto-PID)
let _persistentPid = null;
try {
  _persistentPid = require("../spawnContextBuilder");
} catch (_) { /* spawnContextBuilder not available */ }
const {
  createApprovalSession,
  chooseApprovalChoice,
  detectApprovalPrompt,
  formatApprovalInput
} = require("../approvalEngine");

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch (_error) {
    return null;
  }
}

function extractAssistantMessage(event) {
  if (event?.type === "item.completed" && event?.item?.type === "agent_message") {
    return String(event.item.text || "").trim();
  }
  if (event?.type === "response.completed") {
    const maybe = event?.response?.output_text;
    if (typeof maybe === "string" && maybe.trim()) {
      return maybe.trim();
    }
  }
  return null;
}

function extractCommand(event) {
  const item = event?.item;
  if (!item) {
    return "";
  }
  if (item.type === "command_execution" && item.command) {
    return String(item.command);
  }
  return "";
}

function normalizeImages(rawImages) {
  if (!Array.isArray(rawImages)) {
    return [];
  }

  return rawImages
    .map((imagePath) => String(imagePath || "").trim())
    .filter((imagePath) => imagePath && fs.existsSync(imagePath))
    .slice(0, 6);
}

function normalizeOptions(input, timeoutMs) {
  if (typeof input === "string") {
    return {
      prompt: input,
      timeoutMs: Number(timeoutMs || 240000),
      images: [],
      memoryContext: "",
      approvalMode: "smart",
      approvalPreference: "balanced",
      approvalWaitMs: 20 * 60 * 1000,
      sandbox: "workspace-write",
      webSearch: false,
      model: "",
      modelReasoningEffort: "",
      // Default to hands-free execution. Callers can override this per-run.
      askForApproval: "never",
      onApprovalEscalated: null
    };
  }

  const source = input || {};
  return {
    prompt: String(source.prompt || ""),
    timeoutMs: Number(source.timeoutMs || timeoutMs || 240000),
    images: normalizeImages(source.images),
    memoryContext: String(source.memoryContext || "").trim(),
    approvalMode: String(source.approvalMode || "smart").toLowerCase(),
    approvalPreference: String(source.approvalPreference || "balanced").toLowerCase(),
    approvalWaitMs: Math.max(30 * 1000, Number(source.approvalWaitMs || 20 * 60 * 1000)),
    sandbox: String(source.sandbox || "workspace-write"),
    webSearch: Boolean(source.webSearch),
    model: String(source.model || "").trim(),
    modelReasoningEffort: String(source.modelReasoningEffort || source.reasoningEffort || "").trim().toLowerCase(),
    // "never" means Codex will not ask the user for approval. Prefer this for
    // background agents (Oli/Asolaria) to avoid spammy prompts.
    askForApproval: String(source.askForApproval || "never"),
    onApprovalEscalated: typeof source.onApprovalEscalated === "function" ? source.onApprovalEscalated : null
  };
}

function flattenPromptForWindowsCmd(prompt) {
  return String(prompt || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .join(" | ");
}

function resolveCodexLaunch(executable) {
  const rawExecutable = String(executable || "").trim();
  if (!rawExecutable) {
    return {
      command: executable,
      prefixArgs: [],
      viaCmdWrapper: false
    };
  }

  if (process.platform !== "win32" || !rawExecutable.toLowerCase().endsWith(".cmd")) {
    return {
      command: rawExecutable,
      prefixArgs: [],
      viaCmdWrapper: false
    };
  }

  const codexDir = path.dirname(rawExecutable);
  const nodeExePath = path.join(codexDir, "node.exe");
  const codexJsPath = path.join(codexDir, "node_modules", "@openai", "codex", "bin", "codex.js");
  if (fs.existsSync(nodeExePath) && fs.existsSync(codexJsPath)) {
    return {
      command: nodeExePath,
      prefixArgs: [codexJsPath],
      viaCmdWrapper: false
    };
  }

  return {
    command: rawExecutable,
    prefixArgs: [],
    viaCmdWrapper: true
  };
}

function buildPromptBody(prompt, memoryContext) {
  const cleanPrompt = String(prompt || "").trim();
  const cleanMemory = String(memoryContext || "").trim();
  if (!cleanMemory) {
    return cleanPrompt;
  }

  return [
    "Conversation memory (oldest to newest):",
    cleanMemory,
    "",
    cleanPrompt
  ].join("\n\n");
}

function normalizeApprovalChoice(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text === "approve" || text === "approved" || text === "yes") return "y";
  if (text === "deny" || text === "denied" || text === "reject" || text === "rejected" || text === "no") return "n";
  if (["p", "a", "y", "n"].includes(text[0])) return text[0];
  return "";
}

function extractAvailableApprovalChoices(promptText) {
  const text = String(promptText || "");
  const set = new Set();
  const explicit = text.match(/\(([payn])\)/gi) || [];
  for (const token of explicit) {
    set.add(token.replace(/[()]/g, "").toLowerCase());
  }
  if (/\by\s*\/\s*n\b/i.test(text)) {
    set.add("y");
    set.add("n");
  }
  if (/\bno\b/i.test(text)) {
    set.add("n");
  }
  return set;
}

function chooseSupportedApprovalChoice(preferred, available, preference = "balanced") {
  const normalizedPreferred = normalizeApprovalChoice(preferred);
  if (normalizedPreferred && available.has(normalizedPreferred)) {
    return normalizedPreferred;
  }

  const order = String(preference || "balanced").toLowerCase() === "pay_priority"
    ? ["p", "a", "y", "n"]
    : ["p", "a", "y", "n"];
  for (const choice of order) {
    if (available.has(choice)) {
      return choice;
    }
  }

  return normalizedPreferred || "";
}

function runCodex(input, timeoutMs = 240000) {
  const options = normalizeOptions(input, timeoutMs);
  if (!options.prompt) {
    return Promise.reject(new Error("Prompt is required."));
  }

  return new Promise((resolve, reject) => {
    const toolPaths = resolveToolPaths();
    const executable = toolPaths.codexPath || "codex";
    const launch = resolveCodexLaunch(executable);
    const composedPrompt = buildPromptBody(options.prompt, options.memoryContext);
    const useStdinPrompt = options.images.length > 0;
    const effectiveAskForApproval = useStdinPrompt && options.approvalMode !== "manual"
      ? "never"
      : options.askForApproval;
    const promptArg = launch.viaCmdWrapper
      ? flattenPromptForWindowsCmd(composedPrompt)
      : composedPrompt;

    // NOTE: `-a/-s` are top-level Codex CLI flags and must be placed before the
    // `exec` subcommand (they are NOT `-c` config keys).
    const args = [
      "-a",
      String(effectiveAskForApproval || "never"),
      "-s",
      String(options.sandbox || "workspace-write")
    ];
    if (options.model) {
      args.push("-m", options.model);
    }
    if (["minimal", "low", "medium", "high", "xhigh"].includes(options.modelReasoningEffort)) {
      args.push("-c", `model_reasoning_effort="${options.modelReasoningEffort}"`);
    }
    if (options.webSearch) {
      args.push("--search");
    }
    args.push(
      "exec",
      "--skip-git-repo-check",
      "--json",
      "-C",
      process.cwd()
    );

    for (const imagePath of options.images) {
      args.push("--image", imagePath);
    }

    args.push(useStdinPrompt ? "-" : promptArg);

    let child;
    const spawnArgs = [...launch.prefixArgs, ...args];
    if (launch.viaCmdWrapper) {
      child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", launch.command, ...spawnArgs], {
        windowsHide: true,
        cwd: process.cwd(),
        env: process.env
      });
    } else {
      child = spawn(launch.command, spawnArgs, {
        windowsHide: true,
        cwd: process.cwd(),
        env: process.env
      });
    }

    let stdout = "";
    let stderr = "";
    let outBuffer = "";
    let errBuffer = "";
    let lastKnownCommand = "";
    const assistantMessages = [];
    const approvals = [];
    const approvalSession = createApprovalSession();
    const seenPromptFingerprints = new Set();
    let approvalChain = Promise.resolve();

    // Auto-register PID for codex child process (LX-249 universal auto-PID)
    let _codexPidRole = null;
    if (_persistentPid && _persistentPid.registerSpawnPid && _persistentPid.generateVirtualPid) {
      try {
        _codexPidRole = "codex-" + child.pid;
        const virtualPid = _persistentPid.generateVirtualPid(_codexPidRole);
        _persistentPid.registerSpawnPid(_codexPidRole, virtualPid);
      } catch (_) { /* PID registration failure is non-fatal */ }
    }
    let timeoutHandle = null;
    let settled = false;
    let stdinBroken = false;

    function armTimeout(ms) {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error("Codex timed out."));
      }, Math.max(15000, Number(ms || options.timeoutMs || 240000)));
    }

    function settleReject(error) {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      reject(error);
    }

    function settleResolve(payload) {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      resolve(payload);
    }

    function noteStdinFailure(error, context = "stdin") {
      stdinBroken = true;
      approvals.push({
        choice: null,
        reason: `Codex ${context} error: ${String(error?.message || error || "unknown_error")}`,
        command: lastKnownCommand || "",
        at: new Date().toISOString()
      });
    }

    function writeToChildStdin(payload, context = "stdin_write") {
      if (!child.stdin || !child.stdin.writable || stdinBroken) {
        return false;
      }
      try {
        child.stdin.write(payload, (error) => {
          if (error) {
            noteStdinFailure(error, context);
          }
        });
        return true;
      } catch (error) {
        noteStdinFailure(error, context);
        return false;
      }
    }

    if (child.stdin) {
      child.stdin.on("error", (error) => {
        noteStdinFailure(error, "stdin");
      });
    }

    if (useStdinPrompt) {
      const wrotePrompt = writeToChildStdin(composedPrompt, "prompt_write");
      if (wrotePrompt && child.stdin && !stdinBroken) {
        try {
          child.stdin.end();
        } catch (error) {
          noteStdinFailure(error, "prompt_end");
        }
      }
    }

    async function resolveEscalatedChoice(rawText, decision) {
      const callback = options.onApprovalEscalated;
      if (typeof callback !== "function") {
        return {
          choice: "n",
          reason: "Owner escalation callback not configured."
        };
      }
      const escalationTimeout = Math.max(
        Number(options.timeoutMs || 240000),
        Number(options.approvalWaitMs || 20 * 60 * 1000) + 30000
      );
      armTimeout(escalationTimeout);
      try {
        const result = await callback({
          command: lastKnownCommand,
          promptText: String(rawText || "").trim().slice(0, 1200),
          reason: String(decision?.reason || "Owner approval required."),
          preference: options.approvalPreference,
          waitMs: Number(options.approvalWaitMs || 20 * 60 * 1000)
        });
        const mapped = normalizeApprovalChoice(result?.choice || result?.decision);
        if (!mapped) {
          return {
            choice: "n",
            reason: "Owner escalation returned no decision; denied."
          };
        }
        return {
          choice: mapped,
          reason: String(result?.reason || `Owner escalation decided ${mapped}.`),
          approvalId: String(result?.approvalId || "").trim(),
          status: String(result?.status || "").trim().toLowerCase()
        };
      } catch (error) {
        return {
          choice: "n",
          reason: `Owner escalation failed: ${error.message}`
        };
      } finally {
        armTimeout(options.timeoutMs);
      }
    }

    async function handleApprovalPrompt(rawText) {
      if (!detectApprovalPrompt(rawText)) {
        return;
      }
      if (useStdinPrompt || !child.stdin || !child.stdin.writable || stdinBroken) {
        return;
      }

      const fingerprint = `${String(rawText || "").trim().slice(-180)}|${lastKnownCommand}`;
      if (seenPromptFingerprints.has(fingerprint)) {
        return;
      }
      seenPromptFingerprints.add(fingerprint);

      const available = extractAvailableApprovalChoices(rawText);
      const decision = chooseApprovalChoice({
        command: lastKnownCommand,
        mode: options.approvalMode,
        preference: options.approvalPreference,
        session: approvalSession
      });
      if (!decision.choice && !decision.escalate) {
        return;
      }

      let finalChoice = decision.choice;
      let finalReason = decision.reason;
      let approvalId = "";
      let approvalStatus = "";

      if (decision.escalate) {
        const escalated = await resolveEscalatedChoice(rawText, decision);
        finalChoice = escalated.choice;
        finalReason = `${decision.reason} ${escalated.reason}`.trim();
        approvalId = escalated.approvalId || "";
        approvalStatus = escalated.status || "";
      }

      const supportedChoice = chooseSupportedApprovalChoice(
        finalChoice,
        available,
        options.approvalPreference
      );
      if (!supportedChoice) {
        approvals.push({
          choice: null,
          reason: `${finalReason} No supported choice found in prompt.`,
          command: lastKnownCommand || "",
          approvalId,
          approvalStatus,
          at: new Date().toISOString()
        });
        return;
      }

      if (!writeToChildStdin(formatApprovalInput(supportedChoice), "approval_write")) {
        approvals.push({
          choice: null,
          reason: `${finalReason} Failed to write approval choice to Codex stdin.`,
          command: lastKnownCommand || "",
          approvalId,
          approvalStatus,
          at: new Date().toISOString()
        });
        return;
      }
      approvals.push({
        choice: supportedChoice,
        reason: finalReason,
        command: lastKnownCommand || "",
        approvalId,
        approvalStatus,
        at: new Date().toISOString()
      });
    }

    function queueApprovalPrompt(rawText) {
      approvalChain = approvalChain
        .then(() => handleApprovalPrompt(rawText))
        .catch((error) => {
          approvals.push({
            choice: null,
            reason: `Approval automation error: ${error.message}`,
            command: lastKnownCommand || "",
            at: new Date().toISOString()
          });
        });
    }

    function processStdoutLines() {
      const lines = outBuffer.split(/\r?\n/);
      outBuffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        queueApprovalPrompt(line);

        const event = parseJsonLine(line);
        if (!event) {
          continue;
        }

        const message = extractAssistantMessage(event);
        if (message) {
          assistantMessages.push(message);
        }

        const command = extractCommand(event);
        if (command) {
          lastKnownCommand = command;
        }
      }
    }

    function processStderrLines() {
      const lines = errBuffer.split(/\r?\n/);
      errBuffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }
        queueApprovalPrompt(line);
      }
    }

    armTimeout(options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (settled) return;
      const text = chunk.toString();
      stdout += text;
      outBuffer += text;
      processStdoutLines();
      armTimeout(options.timeoutMs);
    });

    child.stderr.on("data", (chunk) => {
      if (settled) return;
      const text = chunk.toString();
      stderr += text;
      errBuffer += text;
      processStderrLines();
      armTimeout(options.timeoutMs);
    });

    child.on("error", (error) => {
      settleReject(new Error(`Failed to start Codex CLI: ${error.message}`));
    });

    child.on("close", (code) => {
      // Auto-despawn PID on codex exit (LX-249 universal auto-PID)
      if (_persistentPid && _persistentPid.despawnPid && _codexPidRole) {
        try { _persistentPid.despawnPid(_codexPidRole); } catch (_) {}
      }

      if (outBuffer.trim()) {
        queueApprovalPrompt(outBuffer.trim());
        const event = parseJsonLine(outBuffer.trim());
        const message = extractAssistantMessage(event);
        if (message) {
          assistantMessages.push(message);
        }
      }

      if (errBuffer.trim()) {
        queueApprovalPrompt(errBuffer.trim());
      }

      approvalChain.then(() => {
        if (code !== 0) {
          return settleReject(new Error(`Codex exited with code ${code}. ${stderr.trim() || stdout.trim()}`.trim()));
        }

        if (assistantMessages.length === 0 && !stdout.trim()) {
          return settleReject(new Error("Codex returned no assistant message."));
        }

        return settleResolve({
          reply: assistantMessages.length > 0
            ? assistantMessages[assistantMessages.length - 1]
            : stdout.trim(),
          approvals,
          imagesUsed: options.images
        });
      }).catch((error) => {
        settleReject(error);
      });
    });
  });
}

module.exports = {
  runCodex
};
