// src/api.ts
import { randomUUID } from "crypto";
import { gunzipSync } from "zlib";

// src/sync-write.ts
import { createHash } from "crypto";
import { gzipSync } from "zlib";
var THUMBNAIL_PX = 280;
function recipeToApiPayload(recipe) {
  return {
    uid: recipe.uid,
    hash: recipe.hash,
    name: recipe.name,
    categories: recipe.categories,
    ingredients: recipe.ingredients,
    directions: recipe.directions,
    description: recipe.description,
    notes: recipe.notes,
    prep_time: recipe.prep_time,
    cook_time: recipe.cook_time,
    total_time: recipe.total_time,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    rating: recipe.rating,
    created: recipe.created,
    image_url: recipe.image_url,
    photo: recipe.photo,
    photo_hash: recipe.photo_hash,
    photo_large: recipe.photo_large,
    source: recipe.source,
    source_url: recipe.source_url,
    on_favorites: recipe.on_favorites,
    in_trash: recipe.in_trash,
    is_pinned: recipe.is_pinned,
    scale: recipe.scale,
    nutritional_info: recipe.nutritional_info,
    deleted: false
  };
}
function entityFormData(payload, filename = "file") {
  const form = new FormData();
  form.append("data", new Blob([gzipSync(JSON.stringify(payload))]), filename);
  return form;
}
function photoFormData(payload, image, imageFilename, dataFilename = "file") {
  const form = entityFormData(payload, dataFilename);
  form.append("photo_upload", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), imageFilename);
  return form;
}
function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}
async function normalizePhoto(input) {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch (error) {
    throw new Error(
      `the sharp image library is not available (${error instanceof Error ? error.message : String(error)})`
    );
  }
  const base = sharp(input).rotate();
  const [full, thumbnail] = await Promise.all([
    base.clone().jpeg({ quality: 85 }).toBuffer(),
    base.clone().resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
  ]);
  return { thumbnail, full };
}

// src/api.ts
var BASE_URL = "https://paprikaapp.com/api/v2";
var LOGIN_URL = "https://paprikaapp.com/api/v1/account/login/";
var PaprikaClient = class {
  email;
  password;
  token = null;
  constructor(config) {
    this.email = config.email;
    this.password = config.password;
    this.token = config.token ?? null;
  }
  /**
   * Login to get JWT token
   */
  async login() {
    if (this.token) {
      return this.token;
    }
    const response = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `email=${encodeURIComponent(this.email)}&password=${encodeURIComponent(this.password)}`
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Login failed (${response.status}): ${text}`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(`Login error: ${data.error.message}`);
    }
    this.token = data.result.token;
    return this.token;
  }
  async request(endpoint, options = {}, retried = false) {
    const token = await this.login();
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      ...options.headers
    };
    const response = await fetch(url, {
      ...options,
      headers
    });
    if (response.status === 401 && !retried) {
      this.token = null;
      return this.request(endpoint, options, true);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }
    const buffer = await response.arrayBuffer();
    let data;
    try {
      const decompressed = gunzipSync(Buffer.from(buffer));
      data = decompressed.toString("utf-8");
    } catch {
      data = Buffer.from(buffer).toString("utf-8");
    }
    const parsed = JSON.parse(data);
    if (parsed.error) {
      throw new Error(`Paprika API error: ${parsed.error.message}`);
    }
    return parsed.result;
  }
  /**
   * Write a recipe using Paprika's private sync protocol. The app expects a
   * gzipped JSON document in a multipart `data` field. The server accepts an
   * empty hash for a new recipe; edits retain the existing server hash.
   */
  async saveRecipe(recipe) {
    await this.postRecipe(recipe);
    await this.notifySync();
    return recipe;
  }
  async postRecipe(recipe, form) {
    await this.request(`/sync/recipe/${recipe.uid}/`, {
      method: "POST",
      body: form ?? entityFormData(recipeToApiPayload(recipe), "data.gz")
    });
  }
  /** Ask Paprika to tell the user's other devices to sync. */
  async notifySync() {
    await this.request("/sync/notify/", { method: "POST" });
  }
  /** Create a new recipe and notify Paprika clients to refresh. */
  async createRecipe(input, categories) {
    const recipe = this.recipeFromInput(input, categories);
    const photo = await preparePhoto(recipe, input.photo_data);
    const saved = await this.saveRecipe(recipe);
    return this.attachImportedPhoto(saved, photo);
  }
  /** Build a write-ready recipe without changing the cloud. */
  async previewRecipe(input, categories, existing) {
    return this.recipeFromInput(input, categories, existing);
  }
  /** Update an existing recipe, preserving its fields unless input overrides them. */
  async updateRecipe(existing, input, categories) {
    const recipe = this.recipeFromInput(input, categories, existing);
    const photo = await preparePhoto(recipe, input.photo_data);
    const saved = await this.saveRecipe(recipe);
    return this.attachImportedPhoto(saved, photo);
  }
  /** Builds a write-ready recipe without changing the cloud. */
  recipeFromInput(input, categories, existing) {
    const created = existing?.created ?? formatPaprikaDate(/* @__PURE__ */ new Date());
    const recipe = {
      uid: existing?.uid ?? randomUUID().toUpperCase(),
      hash: "",
      name: input.name,
      categories,
      ingredients: input.ingredients,
      directions: input.directions,
      description: input.description ?? existing?.description ?? null,
      notes: input.notes ?? existing?.notes ?? null,
      nutritional_info: input.nutritional_info ?? existing?.nutritional_info ?? null,
      servings: input.servings ?? existing?.servings ?? null,
      difficulty: input.difficulty ?? existing?.difficulty ?? null,
      prep_time: input.prep_time ?? existing?.prep_time ?? null,
      cook_time: input.cook_time ?? existing?.cook_time ?? null,
      total_time: input.total_time ?? existing?.total_time ?? null,
      source: input.source ?? existing?.source ?? null,
      source_url: input.source_url ?? existing?.source_url ?? null,
      // Paprika distinguishes an absent image from an empty URL; new recipes
      // must send null here (the desktop app does), not an empty string.
      image_url: input.image_url ?? existing?.image_url ?? null,
      photo: existing?.photo ?? null,
      photo_hash: existing?.photo_hash ?? null,
      photo_large: existing?.photo_large ?? null,
      scale: existing?.scale ?? null,
      rating: input.rating ?? existing?.rating ?? 0,
      in_trash: false,
      is_pinned: input.is_pinned ?? existing?.is_pinned ?? false,
      on_favorites: input.on_favorites ?? existing?.on_favorites ?? false,
      on_grocery_list: existing?.on_grocery_list ?? false,
      created,
      photo_url: existing?.photo_url ?? null
    };
    recipe.hash = existing?.hash ?? "";
    return recipe;
  }
  /**
   * Attach an image embedded in a `.paprikarecipes`-style import record.
   * Paprika stores a thumbnail and full JPEG separately, so this intentionally
   * uses the three-request upload sequence captured from Paprika.app.
   */
  async attachImportedPhoto(recipe, photo) {
    if (!photo || recipe.photo) return recipe;
    const { thumbnail, full } = photo;
    const photoUid = randomUUID().toUpperCase();
    const thumbnailUid = randomUUID().toUpperCase();
    const recipeWithPhoto = {
      ...recipe,
      photo: `${thumbnailUid}.jpg`,
      photo_large: `${photoUid}.jpg`,
      photo_hash: sha256Hex(thumbnail)
    };
    const photoEntity = {
      uid: photoUid,
      recipe_uid: recipe.uid,
      filename: `${photoUid}.jpg`,
      name: "1",
      order_flag: 0,
      hash: sha256Hex(full),
      deleted: false
    };
    const recipePayload = recipeToApiPayload(recipeWithPhoto);
    await this.postRecipe(recipeWithPhoto, photoFormData(recipePayload, thumbnail, recipeWithPhoto.photo, "data.gz"));
    await this.request(`/sync/photo/${photoUid}/`, {
      method: "POST",
      body: photoFormData(photoEntity, full, photoEntity.filename, "file")
    });
    await this.postRecipe(recipeWithPhoto);
    await this.notifySync();
    return recipeWithPhoto;
  }
  /**
   * Get list of all recipe stubs (uid + hash only)
   */
  async getRecipeList() {
    return this.request("/sync/recipes/");
  }
  /**
   * Get full recipe by UID
   */
  async getRecipe(uid) {
    return this.request(`/sync/recipe/${uid}/`);
  }
  /**
   * Get all recipes with full details
   */
  async getAllRecipes() {
    const stubs = await this.getRecipeList();
    const recipes = [];
    const batchSize = 5;
    for (let i = 0; i < stubs.length; i += batchSize) {
      const batch = stubs.slice(i, i + batchSize);
      const batchRecipes = await Promise.all(
        batch.map((stub) => this.getRecipe(stub.uid))
      );
      recipes.push(...batchRecipes);
      if (i + batchSize < stubs.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    return recipes;
  }
  /**
   * Get all meals
   */
  async getMeals() {
    return this.request("/sync/meals/");
  }
  /**
   * Get all grocery items
   */
  async getGroceries() {
    return this.request("/sync/groceries/");
  }
  /**
   * Get all categories
   */
  async getCategories() {
    return this.request("/sync/categories/");
  }
  /**
   * Search recipes by name (local filter after fetching all)
   */
  async searchRecipes(query) {
    const recipes = await this.getAllRecipes();
    const lowerQuery = query.toLowerCase();
    return recipes.filter(
      (r) => r.name.toLowerCase().includes(lowerQuery) || (r.description ?? "").toLowerCase().includes(lowerQuery)
    );
  }
  /**
   * Get recipe by exact or partial name match
   */
  async findRecipeByName(name) {
    const recipes = await this.getAllRecipes();
    const lowerName = name.toLowerCase();
    const exact = recipes.find((r) => r.name.toLowerCase() === lowerName);
    if (exact) return exact;
    const partial = recipes.find(
      (r) => r.name.toLowerCase().includes(lowerName)
    );
    return partial ?? null;
  }
};
async function preparePhoto(recipe, photoData) {
  if (!photoData || recipe.photo) return null;
  const encoded = photoData.replace(/^data:[^;]+;base64,/i, "");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0) throw new Error("photo_data is empty or invalid base64.");
  try {
    return await normalizePhoto(bytes);
  } catch (error) {
    throw new Error(
      `Could not process photo_data (${error instanceof Error ? error.message : String(error)}). Photo upload needs the optional sharp image library, which prebuilt binaries do not include; install with npm to attach photos.`
    );
  }
}
function formatPaprikaDate(date) {
  const pad = (value) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// src/config.ts
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync
} from "fs";
import { homedir } from "os";
import { join } from "path";

// src/types.ts
var ExitCode = {
  Success: 0,
  Failure: 1,
  InvalidUsage: 2,
  AuthFailure: 3
};

// src/output.ts
function shouldDisableColor() {
  if (process.env["NO_COLOR"] !== void 0) {
    return true;
  }
  if (process.env["TERM"] === "dumb") {
    return true;
  }
  if (!process.stdout.isTTY) {
    return true;
  }
  return false;
}
var forceNoColor = false;
function colorsEnabled() {
  return !forceNoColor && !shouldDisableColor();
}
var colors = {
  reset: "\x1B[0m",
  red: "\x1B[31m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  blue: "\x1B[34m",
  cyan: "\x1B[36m",
  dim: "\x1B[2m",
  bold: "\x1B[1m"
};
function colorize(text, color) {
  if (!colorsEnabled()) {
    return text;
  }
  return `${colors[color]}${text}${colors.reset}`;
}
var style = {
  error: (text) => colorize(text, "red"),
  success: (text) => colorize(text, "green"),
  warn: (text) => colorize(text, "yellow"),
  info: (text) => colorize(text, "blue"),
  cyan: (text) => colorize(text, "cyan"),
  dim: (text) => colorize(text, "dim"),
  bold: (text) => colorize(text, "bold")
};
function printError(message) {
  console.error(style.error("Error:"), message);
}

// src/config.ts
function configBase() {
  const xdg = process.env["XDG_CONFIG_HOME"];
  return xdg && xdg.trim() ? xdg : join(homedir(), ".config");
}
function configDir() {
  return join(configBase(), "paprika-recipe-cli");
}
function configFile() {
  return join(configDir(), "config.json");
}
function legacyConfigFile() {
  return join(configBase(), "paprika-cli", "config.json");
}
function getConfigPath() {
  return configFile();
}
function loadConfig() {
  const file = existsSync(configFile()) ? configFile() : legacyConfigFile();
  if (!existsSync(file)) {
    return null;
  }
  try {
    const data = readFileSync(file, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
function loadConfigFromEnv() {
  const email = process.env["PAPRIKA_EMAIL"];
  const password = process.env["PAPRIKA_PASSWORD"];
  if (email && password) {
    return { email, password };
  }
  return null;
}
function saveConfig(config) {
  if (!existsSync(configDir())) {
    mkdirSync(configDir(), { recursive: true });
  }
  writeFileSync(configFile(), JSON.stringify(config, null, 2), {
    mode: 384
    // read/write for owner only
  });
}
function findConfig() {
  const envConfig = loadConfigFromEnv();
  if (envConfig) return { config: envConfig, source: "env" };
  const fileConfig = loadConfig();
  if (fileConfig?.email && fileConfig?.password) return { config: fileConfig, source: "file" };
  return null;
}
function requireConfig() {
  const found = findConfig();
  if (found) {
    return found.config;
  }
  printError("Not authenticated. Run: paprika auth");
  printError(
    "Or set PAPRIKA_EMAIL and PAPRIKA_PASSWORD environment variables."
  );
  process.exit(ExitCode.AuthFailure);
}

// src/mcp.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// src/core.ts
import { readFileSync as readFileSync2 } from "fs";
function isUuid(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
async function listRecipes(client, category) {
  const recipes = await client.getAllRecipes();
  let active = recipes.filter((r) => !r.in_trash);
  if (category) {
    const categoryLower = category.toLowerCase();
    const categories = await client.getCategories();
    const matchingUids = new Set(
      categories.filter((c) => c.name.toLowerCase().includes(categoryLower)).map((c) => c.uid)
    );
    active = active.filter(
      (r) => r.categories.some((c) => matchingUids.has(c) || c.toLowerCase().includes(categoryLower))
    );
  }
  return active;
}
async function searchRecipes(client, query) {
  const recipes = await client.searchRecipes(query);
  return recipes.filter((r) => !r.in_trash);
}
async function findRecipe(client, identifier) {
  if (isUuid(identifier)) {
    try {
      return await client.getRecipe(identifier);
    } catch {
    }
  }
  return client.findRecipeByName(identifier);
}
async function listMeals(client, date) {
  const meals = await client.getMeals();
  return date ? meals.filter((m) => m.date === date) : meals;
}
async function listGroceries(client, all = false) {
  const items = await client.getGroceries();
  return all ? items : items.filter((i) => !i.purchased);
}
var MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];
function parseRecipeInput(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Recipe input must be a JSON object.");
  }
  const value = parsed;
  for (const field of ["name", "ingredients", "directions"]) {
    const fieldValue = value[field];
    if (typeof fieldValue !== "string" || !fieldValue.trim()) {
      throw new Error(`Recipe input requires a non-empty string: ${field}`);
    }
  }
  if (value.categories !== void 0 && (!Array.isArray(value.categories) || value.categories.some((item) => typeof item !== "string"))) {
    throw new Error("categories must be an array of Paprika category names or UIDs.");
  }
  if (value.photo_data !== void 0 && (typeof value.photo_data !== "string" || value.photo_data.length === 0)) {
    throw new Error("photo_data must be a non-empty base64 string.");
  }
  if (value.rating !== void 0) {
    const rating = value.rating;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 0 || rating > 5) {
      throw new Error("rating must be an integer from 0 to 5.");
    }
  }
  return value;
}
async function resolveCategories(client, values) {
  if (values.length === 0) return [];
  const categories = await client.getCategories();
  const resolved = [];
  for (const value of values) {
    if (isUuid(value)) {
      resolved.push(value);
      continue;
    }
    const exactMatches = categories.filter((category) => category.name === value);
    const matches = exactMatches.length > 0 ? exactMatches : categories.filter((category) => category.name.toLowerCase() === value.toLowerCase());
    if (matches.length === 0) throw new Error(`Paprika category not found: ${value}`);
    if (matches.length > 1) throw new Error(`Paprika category is ambiguous: ${value}. Use its UID instead.`);
    resolved.push(matches[0].uid);
  }
  return [...new Set(resolved)];
}
async function createRecipe(client, input, opts = {}) {
  const categoryUids = await resolveCategories(client, opts.categoryOverride ?? input.categories ?? []);
  if (!opts.confirm) {
    return { action: "would create", dry_run: true, recipe: await client.previewRecipe(input, categoryUids) };
  }
  return { action: "created", dry_run: false, recipe: await client.createRecipe(input, categoryUids) };
}
async function updateRecipe(client, identifier, input, opts = {}) {
  const existing = isUuid(identifier) ? await client.getRecipe(identifier) : await client.findRecipeByName(identifier);
  if (!existing) throw new Error(`Recipe not found: ${identifier}`);
  const categoryUids = await resolveCategories(client, opts.categoryOverride ?? input.categories ?? existing.categories);
  if (!opts.confirm) {
    return {
      action: "would update",
      dry_run: true,
      recipe: await client.previewRecipe(input, categoryUids, existing)
    };
  }
  return { action: "updated", dry_run: false, recipe: await client.updateRecipe(existing, input, categoryUids) };
}

// package.json
var package_default = {
  name: "paprika-recipe-cli",
  version: "0.2.0",
  private: true,
  description: "Unofficial Paprika Recipe Manager CLI and MCP server with safe recipe sync and photo upload",
  license: "MIT",
  author: "Matt Russell (original author); fork maintained by Axel Paul Gunnarsson",
  contributors: [
    "Matt Russell (https://github.com/mjrussell)",
    "Axel Paul Gunnarsson (https://github.com/axelpaul)"
  ],
  repository: {
    type: "git",
    url: "https://github.com/axelpaul/paprika-recipe-cli"
  },
  bugs: {
    url: "https://github.com/axelpaul/paprika-recipe-cli/issues"
  },
  homepage: "https://github.com/axelpaul/paprika-recipe-cli#readme",
  keywords: [
    "paprika",
    "recipe",
    "cli",
    "cooking",
    "meal-planning",
    "grocery",
    "unofficial",
    "mcp"
  ],
  type: "module",
  exports: {
    ".": {
      import: "./dist/index.js",
      types: "./dist/index.d.ts"
    }
  },
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  bin: {
    paprika: "./dist/cli.js"
  },
  files: [
    "dist"
  ],
  engines: {
    node: ">=18"
  },
  scripts: {
    build: `tsup && node -e "require('fs').chmodSync('dist/cli.js', 0o755)"`,
    dev: "tsup --watch",
    typecheck: "tsc --noEmit",
    test: "vitest run",
    check: "npm run typecheck && npm run build && npm test"
  },
  dependencies: {
    "@modelcontextprotocol/sdk": "^1.32.2",
    commander: "^13.0.0",
    zod: "^3.25.76"
  },
  devDependencies: {
    "@types/node": "^22.10.0",
    tsup: "^8.3.5",
    typescript: "^5.7.0",
    vitest: "^3.2.7"
  },
  optionalDependencies: {
    sharp: "^0.34.5"
  }
};

// src/version.ts
var VERSION = package_default.version;

// src/mcp.ts
var WRITES_ENV_VAR = "PAPRIKA_MCP_ENABLE_WRITES";
function writesEnabled(env = process.env) {
  return env[WRITES_ENV_VAR] === "1";
}
var recipeInputSchema = z.object({
  name: z.string().min(1).describe("Recipe name"),
  ingredients: z.string().min(1).describe("Ingredients, one per line"),
  directions: z.string().min(1).describe("Directions, one step per line"),
  description: z.string().optional(),
  notes: z.string().optional(),
  nutritional_info: z.string().optional(),
  servings: z.string().optional(),
  difficulty: z.string().optional(),
  prep_time: z.string().optional(),
  cook_time: z.string().optional(),
  total_time: z.string().optional(),
  source: z.string().optional(),
  source_url: z.string().optional(),
  image_url: z.string().optional(),
  categories: z.array(z.string()).optional().describe("Paprika category names or UIDs"),
  rating: z.number().int().min(0).max(5).optional(),
  is_pinned: z.boolean().optional(),
  on_favorites: z.boolean().optional(),
  photo_data: z.string().min(1).optional().describe("Base64 image bytes; uploaded as the recipe photo if the recipe has none yet")
}).describe("Recipe document, same format as the CLI's recipe JSON file");
function json(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function fail(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}
function summary(recipe) {
  return {
    uid: recipe.uid,
    name: recipe.name,
    categories: recipe.categories,
    rating: recipe.rating,
    description: recipe.description,
    total_time: recipe.total_time,
    servings: recipe.servings
  };
}
function createServer(options = {}) {
  const env = options.env ?? process.env;
  const server = new McpServer({ name: "paprika", version: VERSION });
  let cached = options.client;
  const getClient = () => {
    if (cached) return cached;
    const found = findConfig();
    if (!found) {
      throw new Error(
        "Not authenticated. Set PAPRIKA_EMAIL and PAPRIKA_PASSWORD in the MCP server's env, or run `paprika auth` once."
      );
    }
    cached = new PaprikaClient(found.config);
    return cached;
  };
  const run = (fn) => async (args) => {
    try {
      return json(await fn(args));
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  };
  server.registerTool(
    "whoami",
    {
      description: "Show whether Paprika credentials are configured, which account, and where they come from (env or config file).",
      inputSchema: {},
      annotations: { readOnlyHint: true }
    },
    run(async () => {
      const found = findConfig();
      return found ? { authenticated: true, email: found.config.email, source: found.source } : { authenticated: false };
    })
  );
  server.registerTool(
    "list_recipes",
    {
      description: "List all recipes not in the trash (same as `paprika recipes`). Returns summaries unless full=true. Category filter matches category names partially, case-insensitively.",
      inputSchema: {
        category: z.string().optional().describe("Filter by category name (partial match)"),
        full: z.boolean().optional().describe("Return complete recipe objects instead of summaries")
      },
      annotations: { readOnlyHint: true }
    },
    run(async ({ category, full }) => {
      const recipes = (await listRecipes(getClient(), category)).sort((a, b) => a.name.localeCompare(b.name));
      return full ? recipes : recipes.map(summary);
    })
  );
  server.registerTool(
    "search_recipes",
    {
      description: "Search recipes by name or description (same as `paprika search`). Returns summaries unless full=true.",
      inputSchema: {
        query: z.string().min(1).describe("Text to look for in recipe names and descriptions"),
        full: z.boolean().optional().describe("Return complete recipe objects instead of summaries")
      },
      annotations: { readOnlyHint: true }
    },
    run(async ({ query, full }) => {
      const recipes = await searchRecipes(getClient(), query);
      return full ? recipes : recipes.map(summary);
    })
  );
  server.registerTool(
    "get_recipe",
    {
      description: "Get one recipe by UID or name (exact match first, then partial). Same as `paprika recipe`.",
      inputSchema: {
        identifier: z.string().min(1).describe("Recipe UID or name"),
        ingredients_only: z.boolean().optional().describe("Return only name and ingredients")
      },
      annotations: { readOnlyHint: true }
    },
    run(async ({ identifier, ingredients_only }) => {
      const recipe = await findRecipe(getClient(), identifier);
      if (!recipe) throw new Error(`Recipe not found: ${identifier}`);
      return ingredients_only ? { uid: recipe.uid, name: recipe.name, ingredients: recipe.ingredients } : recipe;
    })
  );
  server.registerTool(
    "list_categories",
    {
      description: "List recipe categories with their UIDs (same as `paprika categories`).",
      inputSchema: {},
      annotations: { readOnlyHint: true }
    },
    run(async () => (await getClient().getCategories()).sort((a, b) => a.name.localeCompare(b.name)))
  );
  server.registerTool(
    "list_meals",
    {
      description: "Show the meal plan, optionally for a single date (same as `paprika meals`).",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Only meals on this date (YYYY-MM-DD)")
      },
      annotations: { readOnlyHint: true }
    },
    run(async ({ date }) => {
      const meals = await listMeals(getClient(), date);
      return meals.map((m) => ({ ...m, type_name: MEAL_TYPES[m.type] ?? "Other" })).sort((a, b) => a.date.localeCompare(b.date) || a.type - b.type);
    })
  );
  server.registerTool(
    "list_groceries",
    {
      description: "Show the grocery list; unpurchased items only unless all=true (same as `paprika groceries`).",
      inputSchema: {
        all: z.boolean().optional().describe("Include purchased items")
      },
      annotations: { readOnlyHint: true }
    },
    run(async ({ all }) => listGroceries(getClient(), all ?? false))
  );
  if (writesEnabled(env)) {
    server.registerTool(
      "create_recipe",
      {
        description: "Create a recipe in Paprika (same as `paprika recipe-create`). With confirm=false (default) it only returns a preview and changes nothing; set confirm=true to upload.",
        inputSchema: {
          recipe: recipeInputSchema,
          categories: z.array(z.string()).optional().describe("Category names or UIDs; overrides recipe.categories"),
          confirm: z.boolean().optional().describe("Must be true to actually create the recipe")
        },
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      run(
        async ({ recipe, categories, confirm }) => createRecipe(getClient(), parseRecipeInput(recipe), { categoryOverride: categories, confirm: confirm === true })
      )
    );
    server.registerTool(
      "update_recipe",
      {
        description: "Replace an existing recipe's editable fields (same as `paprika recipe-update`). Omitted optional fields keep their current values. With confirm=false (default) it only returns a preview; set confirm=true to upload.",
        inputSchema: {
          identifier: z.string().min(1).describe("Recipe UID or name"),
          recipe: recipeInputSchema,
          categories: z.array(z.string()).optional().describe("Category names or UIDs; overrides recipe.categories (default: keep existing)"),
          confirm: z.boolean().optional().describe("Must be true to actually update the recipe")
        },
        annotations: { readOnlyHint: false, destructiveHint: true }
      },
      run(
        async ({
          identifier,
          recipe,
          categories,
          confirm
        }) => updateRecipe(getClient(), identifier, parseRecipeInput(recipe), {
          categoryOverride: categories,
          confirm: confirm === true
        })
      )
    );
  }
  return server;
}
async function serveStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `paprika MCP server ${VERSION} running on stdio (writes ${writesEnabled() ? "enabled" : `disabled; set ${WRITES_ENV_VAR}=1 to enable`})
`
  );
}
export {
  ExitCode,
  PaprikaClient,
  VERSION,
  WRITES_ENV_VAR,
  createServer,
  getConfigPath,
  loadConfig,
  requireConfig,
  saveConfig,
  serveStdio
};
