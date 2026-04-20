// Item 064 · Identity writer · atomic write via .tmp + rename

const fs = require("node:fs");
const path = require("node:path");

function writeIdentity(targetPath, identity) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = targetPath + ".tmp";
  const body = JSON.stringify(identity, null, 2);
  let fd;
  try {
    fd = fs.openSync(tmp, "w");
    fs.writeSync(fd, body);
    try { fs.fsyncSync(fd); } catch {}
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, targetPath);
    return { ok: true, path: targetPath, bytes: body.length };
  } catch (e) {
    if (fd != null) { try { fs.closeSync(fd); } catch {} }
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = { writeIdentity };
