function inferHttpStatusForError(error) {
  if (error?.status) return Number(error.status);
  const msg = String(error?.message || "").toLowerCase();
  if (msg.includes("not found")) return 404;
  if (msg.includes("already has an active lease") || msg.includes("conflict")) return 409;
  if (
    msg.includes("required")
    || msg.includes("invalid")
    || msg.includes("cannot be empty")
    || msg.includes("requires a title or description")
    || msg.includes("must be a number")
    || msg.includes("must be between")
    || msg.includes("unknown_profile:")
    || msg.includes("validation_failed:")
    || msg.includes("staging_gates_failed:")
    || msg.includes("promotion_validation_failed:")
    || msg.includes("promotion_requires_allowauxiliarypromotion")
    || msg.includes("promotion_source_empty:")
    || msg.includes("unsupported_promotion_target:")
    || msg.includes("profile_not_buildable:")
    || msg.includes("running_requires_staging_source")
  ) return 400;
  return 500;
}

function respondGatewayTaskError(res, status, error) {
  return res.status(status).json({
    ok: false,
    error: String(error?.message || "request_failed"),
    code: String(error?.code || "request_failed")
  });
}

function registerGatewayTaskHttpRoutes(app, input = {}) {
  const requireToken = input.requireToken;
  const createTaskLedgerRouter = input.createTaskLedgerRouter;
  const createTaskLeaseLedgerRouter = input.createTaskLeaseLedgerRouter;
  const asoRouter = input.asoRouter;

  const taskLedgerRouter = createTaskLedgerRouter({
    respondError: respondGatewayTaskError,
    inferHttpStatusForError
  });
  app.use("/api/task-ledger", requireToken, taskLedgerRouter);

  const taskLeaseLedgerRouter = createTaskLeaseLedgerRouter({
    respondError: respondGatewayTaskError,
    inferHttpStatusForError
  });
  app.use("/api/task-leases", requireToken, taskLeaseLedgerRouter);

  app.use("/api/aso", requireToken, asoRouter);
}

module.exports = {
  inferHttpStatusForError,
  registerGatewayTaskHttpRoutes,
  respondGatewayTaskError
};
