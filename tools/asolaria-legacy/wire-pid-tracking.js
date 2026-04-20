#!/usr/bin/env node
/**
 * Phase 5: PID Wiring
 * - Add pid/deviceBinding/skillFile frontmatter to skill IX entries
 * - Add ixRef/pidRegistry to skill.json files
 */

const fs = require("fs");
const path = require("path");

const SKILLS_IX_DIR = path.join(__dirname, "..", "data", "agent-index", "skills");
const SKILLS_DIR = path.join(__dirname, "..", "skills");

// Step 1: Add PID frontmatter to skill IX entries
console.log("=== Step 1: Add PID frontmatter to skill IX entries ===");

const skillIxFiles = fs.readdirSync(SKILLS_IX_DIR)
  .filter(f => /^IX-\d{3,4}\.md$/i.test(f));

let updatedIx = 0;
const skillIxMap = new Map(); // ix number -> {name, tags}

for (const filename of skillIxFiles) {
  const filePath = path.join(SKILLS_IX_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf8");

  // Parse existing frontmatter
  if (raw.startsWith("---")) {
    const marker = raw.indexOf("\n---", 3);
    if (marker >= 0) {
      const fm = raw.slice(3, marker).trim();
      const body = raw.slice(marker + 4);

      // Check if pid already exists
      if (fm.includes("pid:")) {
        console.log(`  SKIP (already has pid): ${filename}`);
        continue;
      }

      // Extract name and tags for matching
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const tagsMatch = fm.match(/^tags:\s*(.+)$/m);
      const ixMatch = filename.match(/IX-(\d+)/i);
      const ixNum = ixMatch ? ixMatch[1] : "000";

      const name = nameMatch ? nameMatch[1].trim() : "";
      const tags = tagsMatch ? tagsMatch[1].trim() : "";

      skillIxMap.set(ixNum, { name, tags, filename });

      // Add PID fields to frontmatter
      const newFm = fm + "\npid: —\ndeviceBinding: —\nskillFile: —";
      const newContent = `---\n${newFm}\n---\n${body}`;
      fs.writeFileSync(filePath, newContent, "utf8");
      updatedIx++;
      console.log(`  Updated: ${filename} — ${name}`);
    }
  } else {
    // No frontmatter — add one with PID fields
    const ixMatch = filename.match(/IX-(\d+)/i);
    const ixNum = ixMatch ? ixMatch[1] : "000";
    const newContent = `---\nix: IX-${ixNum.padStart(3, "0")}\ntype: skill\npid: —\ndeviceBinding: —\nskillFile: —\n---\n\n${raw}`;
    fs.writeFileSync(filePath, newContent, "utf8");
    updatedIx++;
    console.log(`  Added frontmatter: ${filename}`);
  }
}

console.log(`  Updated ${updatedIx} skill IX entries`);

// Step 2: Add ixRef/pidRegistry to skill.json files
console.log("\n=== Step 2: Add ixRef/pidRegistry to skill.json files ===");

// Build a lookup from skill name keywords to IX numbers
const skillJsonFiles = [];
function findSkillJsons(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
      const jsonPath = path.join(dir, entry.name, "skill.json");
      if (fs.existsSync(jsonPath)) {
        skillJsonFiles.push({ dir: entry.name, path: jsonPath });
      }
    }
  }
}
findSkillJsons(SKILLS_DIR);

let updatedJson = 0;
for (const skillFile of skillJsonFiles) {
  try {
    const raw = fs.readFileSync(skillFile.path, "utf8");
    const json = JSON.parse(raw);

    if (json.ixRef) {
      console.log(`  SKIP (already has ixRef): ${skillFile.dir}`);
      continue;
    }

    // Add PID tracking fields
    json.ixRef = "—";
    json.pidRegistry = {};

    fs.writeFileSync(skillFile.path, JSON.stringify(json, null, 2) + "\n", "utf8");
    updatedJson++;
    console.log(`  Updated: ${skillFile.dir}/skill.json`);
  } catch (err) {
    console.log(`  ERROR: ${skillFile.dir} — ${err.message}`);
  }
}

console.log(`  Updated ${updatedJson} skill.json files`);

// Also add to whatsapp-adb-send if it exists
const waSendPath = path.join(SKILLS_DIR, "whatsapp-adb-send", "skill.json");
if (fs.existsSync(waSendPath)) {
  try {
    const raw = fs.readFileSync(waSendPath, "utf8");
    const json = JSON.parse(raw);
    if (!json.ixRef) {
      json.ixRef = "IX-311";
      json.pidRegistry = { "jesse-desktop": "—", "jesse-phone": "—" };
      fs.writeFileSync(waSendPath, JSON.stringify(json, null, 2) + "\n", "utf8");
      console.log("  Linked: whatsapp-adb-send → IX-311");
    }
  } catch (_) { /* skip */ }
}

console.log("\n=== Phase 5 Steps 1-2 Complete ===");
