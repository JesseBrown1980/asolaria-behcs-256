// Item 111 · monorepo shared bootstrap — 4-app scaffold (qdd, console, sensor, dash)

function boot({ app, started_at = new Date().toISOString() } = {}) {
  console.log(`[asolaria-app] ${app} boot @ ${started_at}`);
  return { app, started_at };
}

module.exports = { boot };
