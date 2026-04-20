/**
 * Program Absorption Pipeline — Phase 9
 *
 * Analyzes external codebases for safe integration into Asolaria.
 * Stages: acquire → parse → AST extract → dependency graph → complexity score →
 * interface discover → sandbox test → adapter design → decomposition plan
 */

const fs = require("fs");
const path = require("path");
const { appendGraphEvent } = require("./graphRuntimeStore");

// ── Stage 1: Acquisition ──

function acquireProgram(targetPath, options = {}) {
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Target path does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  const isDir = stat.isDirectory();
  const files = isDir ? discoverFiles(resolved, options.extensions || [".js", ".ts", ".json"]) : [resolved];

  return {
    ok: true,
    targetPath: resolved,
    isDirectory: isDir,
    fileCount: files.length,
    files: files.map(f => ({
      path: f,
      relativePath: path.relative(resolved, f),
      size: fs.statSync(f).size,
      extension: path.extname(f)
    })),
    acquiredAt: new Date().toISOString()
  };
}

function discoverFiles(dirPath, extensions, maxDepth = 5, depth = 0) {
  if (depth > maxDepth) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...discoverFiles(full, extensions, maxDepth, depth + 1));
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(full);
      }
    }
  } catch (_) { /* permission error — skip */ }
  return results;
}

// ── Stage 2: Parse + AST Extract ──

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const ext = path.extname(filePath);
  const lines = content.split("\n");

  // Lightweight analysis without full AST parser
  const analysis = {
    path: filePath,
    extension: ext,
    lines: lines.length,
    size: Buffer.byteLength(content, "utf8"),
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    complexity: 0
  };

  // Extract imports
  for (const line of lines) {
    const req = line.match(/require\(["']([^"']+)["']\)/);
    if (req) analysis.imports.push({ type: "require", module: req[1] });
    const imp = line.match(/import\s+.*from\s+["']([^"']+)["']/);
    if (imp) analysis.imports.push({ type: "import", module: imp[1] });
  }

  // Extract exports
  for (const line of lines) {
    if (/module\.exports/.test(line)) analysis.exports.push({ type: "commonjs", line: line.trim().substring(0, 100) });
    if (/^export\s/.test(line)) analysis.exports.push({ type: "esm", line: line.trim().substring(0, 100) });
  }

  // Extract function signatures
  for (let i = 0; i < lines.length; i++) {
    const fn = lines[i].match(/(?:async\s+)?function\s+(\w+)/);
    if (fn) analysis.functions.push({ name: fn[1], line: i + 1, async: /async/.test(lines[i]) });
    const arrow = lines[i].match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
    if (arrow) analysis.functions.push({ name: arrow[1], line: i + 1, async: /async/.test(lines[i]) });
  }

  // Extract class names
  for (let i = 0; i < lines.length; i++) {
    const cls = lines[i].match(/class\s+(\w+)/);
    if (cls) analysis.classes.push({ name: cls[1], line: i + 1 });
  }

  // Complexity: rough cyclomatic (count branches)
  analysis.complexity = (content.match(/\bif\b|\belse\b|\bfor\b|\bwhile\b|\bswitch\b|\bcatch\b|\b\?\s*:/g) || []).length;

  return analysis;
}

// ── Stage 3: Dependency Graph ──

function buildDependencyGraph(files) {
  const graph = { nodes: [], edges: [] };
  const fileMap = new Map();

  for (const file of files) {
    const analysis = analyzeFile(file.path);
    fileMap.set(file.relativePath, analysis);
    graph.nodes.push({
      id: file.relativePath,
      lines: analysis.lines,
      functions: analysis.functions.length,
      complexity: analysis.complexity,
      imports: analysis.imports.length,
      exports: analysis.exports.length
    });
  }

  // Build edges from imports
  for (const [filePath, analysis] of fileMap) {
    for (const imp of analysis.imports) {
      if (imp.module.startsWith(".")) {
        const resolved = path.normalize(path.join(path.dirname(filePath), imp.module));
        const targets = [...fileMap.keys()].filter(k =>
          k === resolved || k === resolved + ".js" || k === resolved + ".ts" || k === resolved + "/index.js"
        );
        for (const target of targets) {
          graph.edges.push({ from: filePath, to: target, type: imp.type });
        }
      } else {
        graph.edges.push({ from: filePath, to: `external:${imp.module}`, type: "external" });
      }
    }
  }

  return graph;
}

// ── Stage 4: Complexity Scoring ──

function scoreComplexity(graph) {
  const totalLines = graph.nodes.reduce((sum, n) => sum + n.lines, 0);
  const totalFunctions = graph.nodes.reduce((sum, n) => sum + n.functions, 0);
  const totalComplexity = graph.nodes.reduce((sum, n) => sum + n.complexity, 0);
  const avgComplexityPerFile = graph.nodes.length ? totalComplexity / graph.nodes.length : 0;
  const externalDeps = new Set(graph.edges.filter(e => e.type === "external").map(e => e.to)).size;

  return {
    totalFiles: graph.nodes.length,
    totalLines,
    totalFunctions,
    totalComplexity,
    avgComplexityPerFile: Math.round(avgComplexityPerFile * 10) / 10,
    externalDependencies: externalDeps,
    internalEdges: graph.edges.filter(e => e.type !== "external").length,
    score: Math.min(10, Math.round((avgComplexityPerFile / 10 + externalDeps / 5 + totalLines / 5000) * 10) / 10),
    verdict: avgComplexityPerFile > 30 ? "high" : avgComplexityPerFile > 15 ? "medium" : "low"
  };
}

// ── Stage 5: Interface Discovery ──

function discoverInterfaces(files) {
  const interfaces = [];
  for (const file of files) {
    const analysis = analyzeFile(file.path);
    if (analysis.exports.length > 0) {
      interfaces.push({
        file: file.relativePath,
        exports: analysis.exports,
        functions: analysis.functions.map(f => f.name),
        classes: analysis.classes.map(c => c.name)
      });
    }
  }
  return interfaces;
}

// ── Orchestrator ──

function analyzeProgram(targetPath, options = {}) {
  const acquired = acquireProgram(targetPath, options);
  const graph = buildDependencyGraph(acquired.files);
  const complexity = scoreComplexity(graph);
  const interfaces = discoverInterfaces(acquired.files);

  appendGraphEvent({
    component: "program_absorption", category: "analysis", action: "program_analyzed",
    actor: { type: "runtime", id: "asolaria-core" },
    target: { type: "external_program", id: targetPath },
    context: { files: acquired.fileCount, lines: complexity.totalLines, score: complexity.score },
    risk: { score: Math.min(9, Math.round(complexity.score)), level: complexity.verdict, reasons: [] }
  });

  return {
    ok: true,
    target: acquired.targetPath,
    fileCount: acquired.fileCount,
    graph,
    complexity,
    interfaces,
    analyzedAt: new Date().toISOString()
  };
}

module.exports = {
  acquireProgram,
  analyzeFile,
  buildDependencyGraph,
  scoreComplexity,
  discoverInterfaces,
  analyzeProgram
};
