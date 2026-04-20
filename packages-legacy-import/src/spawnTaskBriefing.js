function cleanTaskText(value) {
  return String(value || "").trim();
}

function buildTaskBriefingSections(activeTasks = [], taskActivation = {}) {
  const lines = [];
  const tasks = Array.isArray(activeTasks) ? activeTasks : [];

  if (tasks.length > 0) {
    lines.push("## YOUR ACTIVE TASKS");
    for (const task of tasks) {
      const taskId = task.id || task.lx || task.ix || "?";
      const status = cleanTaskText(task.status) || "unknown";
      if (task.source === "task-ledger") {
        const details = [
          `status=${status}`,
          `assignee=${cleanTaskText(task.assigneeId) || "unassigned"}`
        ];
        if (cleanTaskText(task.owner) && cleanTaskText(task.owner) !== cleanTaskText(task.assigneeId)) {
          details.push(`owner=${cleanTaskText(task.owner)}`);
        }
        if (task.leaseContext?.leaseId) {
          details.push(`lease=${cleanTaskText(task.leaseContext.leaseId)} (${cleanTaskText(task.leaseContext.status) || "unknown"}, holder=${cleanTaskText(task.leaseContext.holderId) || "unknown"})`);
        } else {
          details.push("lease=none");
        }
        lines.push(`- ${taskId} ${task.title} [${details.join("; ")}]`);
      } else {
        lines.push(`- ${taskId} ${task.title} [status=${status}; source=index]`);
      }
    }
    lines.push("");
  }

  if (taskActivation && taskActivation.requested) {
    lines.push("## TASK ACTIVATION");
    if (taskActivation.ok) {
      lines.push(`- action=${taskActivation.action}; task=${taskActivation.taskId || "none"}; lease=${taskActivation.leaseId || "none"}; status=${taskActivation.status || "none"}`);
    } else {
      lines.push(`- action=${taskActivation.action}; reason=${taskActivation.reason || "unknown"}`);
    }
    lines.push("");
  }

  return lines;
}

module.exports = {
  buildTaskBriefingSections
};
