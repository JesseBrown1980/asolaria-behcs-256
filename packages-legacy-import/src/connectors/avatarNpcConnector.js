const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDataPath } = require("../runtimePaths");

const DEFAULT_API_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_OUTPUT_DIR = resolveDataPath("avatar-npc");

function clipText(value, limit = 240) {
  return String(value || "").trim().slice(0, Math.max(1, limit));
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function clampNumber(value, fallback, min, max) {
  const parsed = asNumber(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function normalizeCupSize(value) {
  const raw = clipText(value, 8).toUpperCase();
  if (!raw) {
    return "FF";
  }
  if (/^[A-Z]{1,3}$/.test(raw)) {
    return raw;
  }
  return "FF";
}

function normalizeOutfitCoverage(value) {
  const normalized = clipText(value, 40).toLowerCase();
  if (normalized === "modest" || normalized === "conservative") {
    return "modest";
  }
  if (normalized === "business") {
    return "business";
  }
  return "modest";
}

function normalizeProfileInput(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const measurementsSource = source.measurements && typeof source.measurements === "object"
    ? source.measurements
    : {};
  const physicsSource = source.physics && typeof source.physics === "object"
    ? source.physics
    : {};
  const outfitSource = source.outfit && typeof source.outfit === "object"
    ? source.outfit
    : {};

  const personaName = clipText(source.personaName || source.name || "Asolaria Executive", 80);
  const profileId = clipText(source.profileId || source.id || "", 80) || `avatar-${Date.now()}`;
  const ageYears = clampNumber(source.ageYears, 28, 21, 70);

  const measurements = {
    heightCm: clampNumber(measurementsSource.heightCm, 176, 145, 215),
    bustCm: clampNumber(measurementsSource.bustCm, 112, 70, 150),
    underbustCm: clampNumber(measurementsSource.underbustCm, 82, 60, 130),
    waistCm: clampNumber(measurementsSource.waistCm, 66, 45, 120),
    hipsCm: clampNumber(measurementsSource.hipsCm, 104, 70, 160),
    shoulderCm: clampNumber(measurementsSource.shoulderCm, 42, 30, 60),
    inseamCm: clampNumber(measurementsSource.inseamCm, 84, 55, 110),
    cupSize: normalizeCupSize(measurementsSource.cupSize || source.cupSize || "FF")
  };

  const outfit = {
    style: clipText(outfitSource.style || source.outfitStyle || "modern_business", 60) || "modern_business",
    top: clipText(outfitSource.top || "tailored blazer with high-coverage blouse", 120),
    bottom: clipText(outfitSource.bottom || "tailored pencil skirt or slim business trousers", 120),
    footwear: clipText(outfitSource.footwear || "formal pumps", 60),
    palette: clipText(outfitSource.palette || "charcoal, navy, white", 80),
    coverage: normalizeOutfitCoverage(outfitSource.coverage || source.coverage || "modest"),
    revealing: false
  };

  const physics = {
    locomotion: clipText(physicsSource.locomotion || "confident_professional", 60),
    secondaryMotionProfile: clipText(physicsSource.secondaryMotionProfile || "soft_natural", 60),
    chestSoftBody: clampNumber(physicsSource.chestSoftBody, 0.52, 0.05, 0.95),
    waistStiffness: clampNumber(physicsSource.waistStiffness, 0.68, 0.1, 1),
    clothSimulation: physicsSource.clothSimulation !== false,
    hairSimulation: physicsSource.hairSimulation !== false
  };

  const face = {
    expressionStyle: clipText(source.expressionStyle || "intelligent_warm", 60),
    makeupStyle: clipText(source.makeupStyle || "professional_natural", 60),
    hairStyle: clipText(source.hairStyle || "executive_waves", 80),
    eyeColor: clipText(source.eyeColor || "hazel", 40)
  };

  return {
    profileId,
    personaName,
    ageYears,
    measurements,
    outfit,
    physics,
    face,
    quality: clipText(source.quality || "high", 24).toLowerCase() || "high",
    rig: clipText(source.rig || "humanoid_unreal", 60) || "humanoid_unreal",
    outputFormat: clipText(source.outputFormat || "glb", 24).toLowerCase() || "glb"
  };
}

function buildAvatarGenerationPrompt(profile) {
  const m = profile.measurements;
  const p = profile.physics;
  const o = profile.outfit;
  const f = profile.face;

  return [
    "Generate a stylized but realistic adult female NPC avatar for Unreal Engine.",
    "Hard constraints:",
    "- Age 21+ adult presentation only.",
    "- Outfit must be business/professional, non-revealing, and modest.",
    "- No nudity, no transparent clothing, no lingerie styling.",
    "- Physically based secondary motion tuned for natural movement.",
    "",
    "Body measurements:",
    `- Height: ${m.heightCm} cm`,
    `- Bust: ${m.bustCm} cm (cup ${m.cupSize})`,
    `- Underbust: ${m.underbustCm} cm`,
    `- Waist: ${m.waistCm} cm`,
    `- Hips: ${m.hipsCm} cm`,
    `- Shoulders: ${m.shoulderCm} cm`,
    `- Inseam: ${m.inseamCm} cm`,
    "",
    "Outfit and style:",
    `- Style: ${o.style}`,
    `- Top: ${o.top}`,
    `- Bottom: ${o.bottom}`,
    `- Footwear: ${o.footwear}`,
    `- Palette: ${o.palette}`,
    "",
    "Face and identity:",
    `- Name archetype: ${profile.personaName}`,
    `- Expression style: ${f.expressionStyle}`,
    `- Makeup style: ${f.makeupStyle}`,
    `- Hair style: ${f.hairStyle}`,
    `- Eye color: ${f.eyeColor}`,
    "",
    "Motion/physics tuning:",
    `- Locomotion style: ${p.locomotion}`,
    `- Secondary motion profile: ${p.secondaryMotionProfile}`,
    `- Chest soft-body factor: ${p.chestSoftBody}`,
    `- Waist stiffness factor: ${p.waistStiffness}`,
    `- Cloth simulation: ${p.clothSimulation ? "enabled" : "disabled"}`,
    `- Hair simulation: ${p.hairSimulation ? "enabled" : "disabled"}`,
    "",
    "Deliverables:",
    "- Rigged humanoid avatar (Unreal-compatible skeleton)",
    "- Physics-ready setup notes for cloth and secondary motion",
    "- GLB/FBX or equivalent import format"
  ].join("\n");
}

function buildUnrealNpcConfig(profile) {
  return {
    profileId: profile.profileId,
    personaName: profile.personaName,
    skeleton: {
      target: "UE5_Mannequin_Female_Compatible",
      retargetPreset: "Humanoid",
      rootMotion: true
    },
    mesh: {
      expectedFormat: profile.outputFormat,
      unitScale: "centimeters",
      rig: profile.rig
    },
    animationBlueprint: {
      base: "ABP_AsolariaBusinessNPC",
      locomotionProfile: profile.physics.locomotion,
      facialStyle: profile.face.expressionStyle
    },
    physics: {
      usePhysicsAsset: true,
      chestSoftBody: profile.physics.chestSoftBody,
      waistStiffness: profile.physics.waistStiffness,
      clothSimulation: profile.physics.clothSimulation,
      hairSimulation: profile.physics.hairSimulation,
      collisionPreset: "CharacterMesh"
    },
    clothing: {
      style: profile.outfit.style,
      coverage: profile.outfit.coverage,
      revealing: false
    },
    safety: {
      adultOnly: true,
      nonRevealingBusinessAttire: true
    }
  };
}

function buildUnrealPythonImportScript(profile, unrealConfig) {
  const safeProfileId = clipText(profile.profileId, 80).replace(/[^a-zA-Z0-9_]/g, "_") || "AsolariaAvatar";
  return [
    "import unreal",
    "",
    "# Auto-generated by Asolaria avatar_npc_generate",
    `PROFILE_ID = \"${safeProfileId}\"`,
    "CONTENT_ROOT = \"/Game/Asolaria/Avatars\"",
    "SKELETON_TARGET = \"UE5_Mannequin_Female_Compatible\"",
    "",
    "def import_avatar(source_file, destination_path=None):",
    "    if not source_file:",
    "        raise RuntimeError(\"source_file is required\")",
    "    dest = destination_path or f\"{CONTENT_ROOT}/{PROFILE_ID}\"",
    "    task = unreal.AssetImportTask()",
    "    task.filename = source_file",
    "    task.destination_path = dest",
    "    task.automated = True",
    "    task.replace_existing = True",
    "    task.save = True",
    "",
    "    options = unreal.FbxImportUI()",
    "    options.import_as_skeletal = True",
    "    options.import_animations = False",
    "    options.import_mesh = True",
    "    options.skeletal_mesh_import_data.import_translation = unreal.Vector(0.0, 0.0, 0.0)",
    "    options.skeletal_mesh_import_data.import_uniform_scale = 1.0",
    "    task.options = options",
    "",
    "    tools = unreal.AssetToolsHelpers.get_asset_tools()",
    "    tools.import_asset_tasks([task])",
    "    return task.imported_object_paths",
    "",
    "def apply_runtime_notes():",
    `    unreal.log(\"Asolaria profile: ${profile.personaName}\")`,
    `    unreal.log(\"Locomotion profile: ${unrealConfig.animationBlueprint.locomotionProfile}\")`,
    `    unreal.log(\"Chest soft-body factor: ${unrealConfig.physics.chestSoftBody}\")`,
    `    unreal.log(\"Waist stiffness factor: ${unrealConfig.physics.waistStiffness}\")`,
    `    unreal.log(\"Cloth simulation: ${Boolean(unrealConfig.physics.clothSimulation) ? "true" : "false"}\")`,
    `    unreal.log(\"Hair simulation: ${Boolean(unrealConfig.physics.hairSimulation) ? "true" : "false"}\")`,
    "    unreal.log(\"Configure Physics Asset and Control Rig using unreal-npc-config.json values.\")",
    "",
    "# Usage inside Unreal Python console:",
    "# imported = import_avatar(r\"C:\\\\path\\\\to\\\\avatar-model.fbx\")",
    "# apply_runtime_notes()",
    "# unreal.EditorAssetLibrary.save_directory(CONTENT_ROOT, recursive=True)"
  ].join("\n");
}

function pickFirstNonEmptyString(values = []) {
  for (const value of values) {
    const text = clipText(value, 2000);
    if (text) return text;
  }
  return "";
}

function resolveAvatarApiResponseShape(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const data = source.data && typeof source.data === "object" ? source.data : source;
  return {
    modelUrl: pickFirstNonEmptyString([
      data.modelUrl,
      data.model_url,
      data.glbUrl,
      data.glb_url,
      data.fbxUrl,
      data.fbx_url
    ]),
    previewImageUrl: pickFirstNonEmptyString([
      data.previewImageUrl,
      data.preview_image_url,
      data.thumbnailUrl,
      data.thumbnail_url,
      data.imageUrl,
      data.image_url
    ]),
    jobId: pickFirstNonEmptyString([data.jobId, data.job_id, source.jobId, source.id]),
    status: pickFirstNonEmptyString([data.status, source.status]) || "ok",
    glbBase64: pickFirstNonEmptyString([data.glbBase64, data.glb_base64]),
    fbxBase64: pickFirstNonEmptyString([data.fbxBase64, data.fbx_base64])
  };
}

async function callAvatarApi(apiUrl, token, requestBody, timeoutMs = DEFAULT_API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5000, timeoutMs));
  try {
    const headers = {
      "Content-Type": "application/json"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch (_error) {
      parsed = { raw: text };
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: parsed
    };
  } finally {
    clearTimeout(timer);
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function safeFileName(value, fallback = "avatar-model") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized ? normalized.slice(0, 80) : fallback;
}

function decodeBase64ToBuffer(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const stripped = raw.includes(",") ? raw.split(",").pop() : raw;
  try {
    return Buffer.from(stripped, "base64");
  } catch (_error) {
    return null;
  }
}

async function generateAvatarNpcRepresentation(input = {}) {
  const profile = normalizeProfileInput(input);
  const prompt = buildAvatarGenerationPrompt(profile);
  const unrealConfig = buildUnrealNpcConfig(profile);

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const slug = safeFileName(profile.profileId || profile.personaName || "");
  const runId = `${timestamp}-${slug}-${crypto.randomBytes(3).toString("hex")}`;
  const outputDir = path.join(DEFAULT_OUTPUT_DIR, runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const profilePath = path.join(outputDir, "avatar-profile.json");
  const promptPath = path.join(outputDir, "avatar-prompt.txt");
  const unrealConfigPath = path.join(outputDir, "unreal-npc-config.json");
  const unrealImportScriptPath = path.join(outputDir, "unreal-import-avatar.py");
  writeJson(profilePath, profile);
  fs.writeFileSync(promptPath, `${prompt}\n`, "utf8");
  writeJson(unrealConfigPath, unrealConfig);
  fs.writeFileSync(unrealImportScriptPath, `${buildUnrealPythonImportScript(profile, unrealConfig)}\n`, "utf8");

  const apiUrl = clipText(
    input.apiUrl
    || process.env.ASOLARIA_AVATAR_NPC_API_URL
    || "",
    2000
  );
  const apiToken = clipText(
    input.apiToken
    || process.env.ASOLARIA_AVATAR_NPC_API_TOKEN
    || "",
    400
  );

  const result = {
    ok: true,
    runId,
    outputDir,
    files: {
      profile: profilePath,
      prompt: promptPath,
      unrealConfig: unrealConfigPath,
      unrealImportScript: unrealImportScriptPath
    },
    profile,
    render: {
      mode: "spec_only",
      apiConfigured: Boolean(apiUrl),
      status: "pending_api_configuration"
    }
  };

  if (!apiUrl) {
    return result;
  }

  const requestBody = {
    profile,
    prompt,
    unrealConfig,
    output: {
      format: profile.outputFormat,
      rig: profile.rig
    }
  };

  const timeoutMs = clampNumber(input.timeoutMs, DEFAULT_API_TIMEOUT_MS, 5000, 15 * 60 * 1000);
  const apiResult = await callAvatarApi(apiUrl, apiToken, requestBody, timeoutMs);
  const apiResponsePath = path.join(outputDir, "avatar-api-response.json");
  writeJson(apiResponsePath, {
    ok: apiResult.ok,
    status: apiResult.status,
    statusText: apiResult.statusText,
    body: apiResult.body
  });
  result.files.apiResponse = apiResponsePath;

  if (!apiResult.ok) {
    result.ok = false;
    result.render = {
      mode: "api",
      apiConfigured: true,
      status: "failed",
      statusCode: apiResult.status,
      error: clipText(
        apiResult.body?.error?.message
        || apiResult.body?.error
        || apiResult.statusText
        || "avatar_api_request_failed",
        320
      )
    };
    return result;
  }

  const shaped = resolveAvatarApiResponseShape(apiResult.body);
  const modelBase64Buffer = decodeBase64ToBuffer(shaped.glbBase64 || shaped.fbxBase64);
  if (modelBase64Buffer) {
    const extension = shaped.glbBase64 ? "glb" : "fbx";
    const modelPath = path.join(outputDir, `avatar-model.${extension}`);
    fs.writeFileSync(modelPath, modelBase64Buffer);
    result.files.generatedModel = modelPath;
  }

  result.render = {
    mode: "api",
    apiConfigured: true,
    status: shaped.status || "ok",
    jobId: shaped.jobId,
    modelUrl: shaped.modelUrl,
    previewImageUrl: shaped.previewImageUrl
  };
  return result;
}

function manifest() {
  return {
    id: "avatar-npc",
    version: "1.0.0",
    description: "Generates Unreal Engine NPC avatar profiles, prompts, physics configs, and optional API-driven 3D model rendering",
    capabilities: ["avatar-generation", "unreal-config", "model-export"],
    readScopes: [],
    writeScopes: ["filesystem:avatar-npc-output"],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 30000,
    secretRequirements: [],
    sideEffects: ["filesystem-write-profile", "filesystem-write-model", "external-api-call"],
    failureModes: ["api-unavailable", "api-timeout", "invalid-profile-input"],
    emittedEvents: []
  };
}

module.exports = {
  generateAvatarNpcRepresentation,
  manifest
};
