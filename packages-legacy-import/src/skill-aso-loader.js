/** Skill ASO Loader — injects ASO context when skills execute.
 *  Wraps skill loading with observation/outcome tracking.
 *  No skill.json files are modified; ASO awareness is injected at load time. */

const fs = require("fs");
const path = require("path");

const aso = require("./aso-client");

const SKILLS_DIR = path.resolve(__dirname, "..", "skills");

const topicCache = new Map();
let runtimeTopicId = "";

function resolveRuntimeTopicId() {
  if (runtimeTopicId) return runtimeTopicId;

  const existingTopics = aso.list({ type: "topic" });
  if (Array.isArray(existingTopics)) {
    const runtimeTopic = existingTopics.find((topic) => topic.name === "ASO Language Runtime");
    if (runtimeTopic?.asoId) {
      runtimeTopicId = runtimeTopic.asoId;
      return runtimeTopicId;
    }
  }

  const matches = aso.search("ASO Language Runtime");
  if (matches && Array.isArray(matches.matches)) {
    const exact = matches.matches.find((match) => match.name === "ASO Language Runtime");
    if (exact?.asoId) {
      runtimeTopicId = exact.asoId;
      return runtimeTopicId;
    }
  }

  const created = aso.topic("ASO Language Runtime", "topic", {
    tier: "foundational",
    summary: "Portable runtime anchor for ASO-aware skill execution.",
    tags: ["aso", "runtime", "portable_core"]
  });
  runtimeTopicId = created?.id || created?.asoId || "";
  return runtimeTopicId;
}

function getSkillTopic(skillName, meta = {}) {
  if (topicCache.has(skillName)) return topicCache.get(skillName);

  const exactName = `skill/${skillName}`;
  const hits = aso.search(exactName);
  if (hits && Array.isArray(hits.matches)) {
    const exact = hits.matches.find((match) => match.name === exactName && match.type === "skill");
    if (exact?.asoId) {
      topicCache.set(skillName, exact.asoId);
      return exact.asoId;
    }
  }

  const created = aso.topic(exactName, "skill", {
    tier: "operational",
    summary: meta.description || meta.title || `Skill: ${skillName}`,
    tags: ["skill", "auto-registered", ...(Array.isArray(meta.tags) ? meta.tags : [])]
  });
  const topicId = created?.id || created?.asoId || "";
  if (!topicId) return "";

  const parentRuntimeId = resolveRuntimeTopicId();
  if (parentRuntimeId) {
    try {
      aso.relate(topicId, "part_of", parentRuntimeId);
    } catch (_) {
      // Relation creation is best-effort only.
    }
  }

  topicCache.set(skillName, topicId);
  return topicId;
}

function loadSkill(skillDir) {
  const dir = path.isAbsolute(skillDir) ? skillDir : path.join(SKILLS_DIR, skillDir);
  const skillName = path.basename(dir);
  const configPath = path.join(dir, "skill.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const topicId = getSkillTopic(skillName, config);

  try {
    aso.observe(topicId, `skill ${skillName} loaded`, { source: "skill-aso-loader" });
  } catch (_) {
    // Observation is best-effort only.
  }

  config._aso = {
    topicId,
    skillName,
    loadedAt: new Date().toISOString()
  };

  config.run = function runWithAso(executeFn) {
    if (typeof executeFn !== "function") {
      throw new TypeError("loadSkill(...).run requires an execute function.");
    }
    try {
      aso.observe(topicId, `skill ${skillName} invoked`, { source: "skill-aso-loader" });
    } catch (_) {
      // Observation is best-effort only.
    }
    try {
      const result = executeFn(config);
      if (result && typeof result.then === "function") {
        return result.then(
          (value) => {
            try {
              aso.outcome(topicId, "invocation", "success", { source: "skill-aso-loader" });
            } catch (_) {
              // Outcome write is best-effort only.
            }
            return value;
          },
          (error) => {
            try {
              aso.outcome(topicId, "invocation", `error: ${error.message || error}`, { source: "skill-aso-loader" });
            } catch (_) {
              // Outcome write is best-effort only.
            }
            throw error;
          }
        );
      }
      try {
        aso.outcome(topicId, "invocation", "success", { source: "skill-aso-loader" });
      } catch (_) {
        // Outcome write is best-effort only.
      }
      return result;
    } catch (error) {
      try {
        aso.outcome(topicId, "invocation", `error: ${error.message || error}`, { source: "skill-aso-loader" });
      } catch (_) {
        // Outcome write is best-effort only.
      }
      throw error;
    }
  };

  return config;
}

function listAsoSkills() {
  const results = [];
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const configPath = path.join(SKILLS_DIR, entry.name, "skill.json");
    if (!fs.existsSync(configPath)) continue;
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const topicId = getSkillTopic(entry.name, config);
      results.push({
        name: entry.name,
        asoId: topicId,
        title: config.title || entry.name
      });
    } catch (_) {
      // Skip malformed skill.json files.
    }
  }
  return results;
}

module.exports = {
  loadSkill,
  listAsoSkills,
  getSkillTopic,
  resolveRuntimeTopicId
};
