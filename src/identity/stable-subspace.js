// Item 068 · Drive-letter-free stable-subspace addressing
// Maps "liris:votes" / "acer:packages" to current-OS-appropriate absolute paths.
// Never hardcodes E:\ / C:\ / /sdcard/ — resolver derives at call time.

const path = require("node:path");
const os = require("node:os");

const SUBSPACES = {
  "acer:asolaria-root":    () => path.join(os.homedir(), "Asolaria"),
  "acer:repo-root":        () => "C:/asolaria-acer",
  "acer:public-repo":      () => "C:/asolaria-behcs-256",
  "liris:asolaria-root":   () => "//DESKTOP-J99VCNH/Users/rayss/Asolaria",
  "liris:behcs-256":       () => "//DESKTOP-J99VCNH/Users/rayss/Asolaria-BEHCS-256",
  "liris:votes":           () => "//DESKTOP-J99VCNH/Users/rayss/Asolaria/data/votes",
  "liris:cubes":           () => "//DESKTOP-J99VCNH/Users/rayss/Asolaria/data/cubes",
  "falcon:sdcard-asolaria": () => "/sdcard/asolaria",
  "aether:sdcard-asolaria": () => "/sdcard/asolaria",
};

function resolve(subspace) {
  const fn = SUBSPACES[subspace];
  if (!fn) return { ok: false, reason: "unknown-subspace", known: Object.keys(SUBSPACES) };
  return { ok: true, path: fn(), subspace };
}

module.exports = { resolve, SUBSPACES };
