const express = require("express");
const router = express.Router();
const { spawnSync } = require("child_process");

router.post("/fire", (req, res) => {
  const type = String(req.body?.type || "enter").trim();
  try {
    if (type === "continue") {
      spawnSync("powershell.exe", [
        "-NoProfile", "-Command",
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('continue'); Start-Sleep -Milliseconds 80; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"
      ], { timeout: 5000, windowsHide: true });
    } else {
      spawnSync("powershell.exe", [
        "-NoProfile", "-Command",
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"
      ], { timeout: 5000, windowsHide: true });
    }
    return res.json({ ok: true, type, at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

module.exports = router;
