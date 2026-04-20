function createSymphonyLinearRuntime(input = {}) {
  const fetchImpl = typeof input.fetchImpl === "function"
    ? input.fetchImpl
    : global.fetch;
  const normalizeApiKey = typeof input.normalizeApiKey === "function"
    ? input.normalizeApiKey
    : (value) => String(value || "").trim();
  const normalizeText = typeof input.normalizeText === "function"
    ? input.normalizeText
    : (value, maxLen = 600) => String(value || "").trim().slice(0, maxLen);

  async function linearGraphqlRequest(config, query, variables = {}) {
    const apiKey = normalizeApiKey(config?.linearApiKey);
    if (!apiKey) {
      throw new Error("Symphony Linear API key is not configured.");
    }
    const response = await fetchImpl("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey
      },
      body: JSON.stringify({
        query: String(query || ""),
        variables: variables && typeof variables === "object" ? variables : {}
      })
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = Array.isArray(json?.errors) && json.errors.length
        ? json.errors.map((item) => item?.message || "request_failed").join("; ")
        : `Linear request failed (${response.status})`;
      throw new Error(message);
    }
    if (Array.isArray(json?.errors) && json.errors.length) {
      throw new Error(json.errors.map((item) => item?.message || "request_failed").join("; "));
    }
    return json?.data || {};
  }

  function slugifyLinearText(value) {
    return normalizeText(value, 240)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function extractLinearProjectSlugCandidates(value) {
    const raw = normalizeText(value, 240);
    if (!raw) return [];
    const normalized = raw.replace(/^https?:\/\/[^/]+\//i, "").trim();
    const candidates = new Set();
    candidates.add(raw.toLowerCase());
    candidates.add(normalized.toLowerCase());
    const slugMatch = normalized.match(/project\/([^/?#]+)/i);
    if (slugMatch && slugMatch[1]) {
      candidates.add(String(slugMatch[1]).toLowerCase());
    }
    const tail = raw.split("/").filter(Boolean).pop() || "";
    if (tail) {
      candidates.add(tail.toLowerCase());
    }
    const suffixMatch = raw.match(/([a-z0-9]{8,})$/i);
    if (suffixMatch && suffixMatch[1]) {
      candidates.add(String(suffixMatch[1]).toLowerCase());
    }
    return Array.from(candidates).filter(Boolean);
  }

  function pickLinearTodoState(states = []) {
    if (!Array.isArray(states) || !states.length) return null;
    return states.find((item) => String(item?.type || "").toLowerCase() === "unstarted")
      || states.find((item) => String(item?.name || "").toLowerCase() === "todo")
      || states.find((item) => String(item?.type || "").toLowerCase() === "backlog")
      || states[0]
      || null;
  }

  async function resolveLinearProjectContext(config) {
    const slugCandidates = extractLinearProjectSlugCandidates(config?.linearProjectSlug);
    if (!slugCandidates.length) {
      throw new Error("Symphony Linear project slug is not configured.");
    }
    const teamData = await linearGraphqlRequest(
      config,
      `
        query SymphonyLinearTeams {
          teams {
            nodes {
              id
              name
              key
              states {
                nodes {
                  id
                  name
                  type
                }
              }
            }
          }
        }
      `
    );
    const projectData = await linearGraphqlRequest(
      config,
      `
        query SymphonyLinearProjects {
          projects(first: 100) {
            nodes {
              id
              name
              slugId
              url
              teams {
                nodes {
                  id
                  name
                  key
                }
              }
            }
          }
        }
      `
    );
    const projects = Array.isArray(projectData?.projects?.nodes) ? projectData.projects.nodes : [];
    const teams = Array.isArray(teamData?.teams?.nodes) ? teamData.teams.nodes : [];
    const project = projects.find((item) => {
      const url = String(item?.url || "").toLowerCase();
      const slugId = String(item?.slugId || "").toLowerCase();
      const nameSlug = slugifyLinearText(item?.name || "");
      return slugCandidates.some((candidate) =>
        candidate === slugId
        || candidate === nameSlug
        || url.includes(candidate)
      );
    });
    if (!project) {
      throw new Error(`Linear project not found for configured slug "${config.linearProjectSlug}".`);
    }
    const projectTeams = Array.isArray(project?.teams?.nodes) ? project.teams.nodes : [];
    const primaryProjectTeamId = String(projectTeams[0]?.id || "");
    const team = teams.find((item) => String(item?.id || "") === primaryProjectTeamId)
      || projectTeams.find((candidate) => candidate?.id && teams.some((item) => item?.id === candidate.id))
      || teams[0]
      || null;
    if (!team?.id) {
      throw new Error(`Linear team not found for project "${project.name || config.linearProjectSlug}".`);
    }
    const states = Array.isArray(team?.states?.nodes) ? team.states.nodes : [];
    const todoState = pickLinearTodoState(states);
    return {
      project: {
        id: String(project.id || ""),
        name: String(project.name || ""),
        slugId: String(project.slugId || ""),
        url: String(project.url || "")
      },
      team: {
        id: String(team.id || ""),
        name: String(team.name || ""),
        key: String(team.key || "")
      },
      todoState: todoState
        ? {
            id: String(todoState.id || ""),
            name: String(todoState.name || ""),
            type: String(todoState.type || "")
          }
        : null
    };
  }

  function buildSymphonyIssueDescription(inputValue = {}, config = {}, context = {}) {
    const lines = [
      "## Asolaria Symphony Work Item",
      "",
      `Objective: ${normalizeText(inputValue.objective || inputValue.title || "", 4000) || "(missing objective)"}`,
      "",
      "### Routing Context",
      `- taskType: ${normalizeText(inputValue.taskType, 80) || "long_running"}`,
      `- sensitivity: ${normalizeText(inputValue.sensitivity, 80) || "internal"}`,
      `- size: ${normalizeText(inputValue.size, 80) || "medium"}`,
      inputValue.taskId ? `- asolariaTaskId: ${normalizeText(inputValue.taskId, 120)}` : "",
      inputValue.dispatchId ? `- dispatchId: ${normalizeText(inputValue.dispatchId, 120)}` : "",
      config.workflowPath ? `- workflowPath: ${normalizeText(config.workflowPath, 600)}` : "",
      context?.project?.url ? `- linearProject: ${normalizeText(context.project.url, 600)}` : "",
      "",
      inputValue.instructions ? "### Instructions" : "",
      inputValue.instructions ? normalizeText(inputValue.instructions, 12000) : "",
      "",
      Array.isArray(inputValue.allowedPaths) && inputValue.allowedPaths.length ? "### Allowed Paths" : "",
      Array.isArray(inputValue.allowedPaths) && inputValue.allowedPaths.length
        ? inputValue.allowedPaths.map((item) => `- ${normalizeText(item, 600)}`).join("\n")
        : "",
      "",
      Array.isArray(inputValue.expectedArtifacts) && inputValue.expectedArtifacts.length ? "### Expected Artifacts" : "",
      Array.isArray(inputValue.expectedArtifacts) && inputValue.expectedArtifacts.length
        ? inputValue.expectedArtifacts.map((item) => `- ${normalizeText(item, 600)}`).join("\n")
        : "",
      "",
      "### Mistakes To Avoid",
      "- Do not widen scope beyond the objective.",
      "- Do not assume unapproved secrets, accounts, or repos are allowed.",
      "- Call out blockers explicitly instead of guessing.",
      "- Return concrete artifacts or status, not just acknowledgements."
    ].filter(Boolean);
    return lines.join("\n");
  }

  function mapSymphonyPriority(inputValue = {}) {
    const sensitivity = normalizeText(inputValue.sensitivity, 80).toLowerCase();
    const size = normalizeText(inputValue.size, 80).toLowerCase();
    if (sensitivity === "owner_plane") return 3;
    if (sensitivity === "privileged") return 2;
    if (size === "large") return 2;
    return 1;
  }

  return {
    linearGraphqlRequest,
    slugifyLinearText,
    extractLinearProjectSlugCandidates,
    pickLinearTodoState,
    resolveLinearProjectContext,
    buildSymphonyIssueDescription,
    mapSymphonyPriority
  };
}

module.exports = {
  createSymphonyLinearRuntime
};
