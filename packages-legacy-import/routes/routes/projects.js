/**
 * Projects Routes — extracted from server.js (ADR-0001 strangler-fig)
 */
const express = require("express");
const router = express.Router();
const { asBool, asInt, respondError } = require("../lib/helpers");
const {
  listProjects, getProjectById, createProject, updateProject, deleteProject,
  buildProjectScopes, getProjectSummary, PROJECT_GROUPS
} = require("../src/projectStore");

function createProjectsRouter() {
  router.get("/", (req, res) => {
    const includeArchived = asBool(req.query?.includeArchived, false);
    const limit = asInt(req.query?.limit, 200, 1, 1000);
    const projects = listProjects({ includeArchived, limit });
    const scopes = buildProjectScopes(projects);
    res.json({ ok: true, count: projects.length, summary: getProjectSummary(), groups: PROJECT_GROUPS.slice(0), projects, scopes });
  });

  router.get("/:id", (req, res) => {
    const includeArchived = asBool(req.query?.includeArchived, true);
    const project = getProjectById(req.params.id, { includeArchived });
    if (!project) return respondError(res, "Project not found.", 404);
    return res.json({ ok: true, project });
  });

  router.post("/", (req, res) => {
    try {
      const created = createProject({ id: req.body?.id, label: req.body?.label ?? req.body?.name, marker: req.body?.marker, group: req.body?.group, folders: req.body?.folders });
      const scopes = buildProjectScopes(listProjects({ includeArchived: false, limit: 500 }));
      return res.json({ ok: true, ...created, groups: PROJECT_GROUPS.slice(0), scopes });
    } catch (error) { return respondError(res, error, 400); }
  });

  router.put("/:id", (req, res) => {
    try {
      const body = req.body || {};
      const patch = {};
      for (const field of ["label", "name", "marker", "group", "folders", "archived"]) {
        if (Object.prototype.hasOwnProperty.call(body, field)) patch[field] = body[field];
      }
      if (Object.keys(patch).length < 1) return respondError(res, "No project fields provided for update.", 400);
      const updated = updateProject(req.params.id, patch);
      const scopes = buildProjectScopes(listProjects({ includeArchived: false, limit: 500 }));
      return res.json({ ok: true, ...updated, groups: PROJECT_GROUPS.slice(0), scopes });
    } catch (error) {
      const message = String(error?.message || error || "").toLowerCase();
      return respondError(res, error, message.includes("not found") ? 404 : 400);
    }
  });

  router.delete("/:id", (req, res) => {
    try {
      const hard = asBool(req.query?.hard ?? req.body?.hard, false);
      const removed = deleteProject(req.params.id, { hard });
      const scopes = buildProjectScopes(listProjects({ includeArchived: false, limit: 500 }));
      return res.json({ ok: true, ...removed, groups: PROJECT_GROUPS.slice(0), scopes });
    } catch (error) {
      const message = String(error?.message || error || "").toLowerCase();
      return respondError(res, error, message.includes("not found") ? 404 : 400);
    }
  });

  return router;
}

module.exports = createProjectsRouter;
