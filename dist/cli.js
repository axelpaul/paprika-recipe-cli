#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/tsup/assets/esm_shims.js
import path from "path";
import { fileURLToPath } from "url";
var init_esm_shims = __esm({
  "node_modules/tsup/assets/esm_shims.js"() {
    "use strict";
  }
});

// src/api.ts
import { randomUUID } from "crypto";
import { gunzipSync } from "zlib";
import { PaprikaClient as PaprikaWriteClient } from "@bojanrajkovic/mcp-paprika/dist/paprika/client.js";
import { normalizePhoto, sha256Hex } from "@bojanrajkovic/mcp-paprika/dist/tools/photo-helpers.js";
async function preparePhoto(recipe, photoData) {
  if (!photoData || recipe.photo) return null;
  const encoded = photoData.replace(/^data:[^;]+;base64,/i, "");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0) throw new Error("photo_data is empty or invalid base64.");
  try {
    return await normalizePhoto(bytes);
  } catch (error) {
    throw new Error(
      `Could not process photo_data (${error instanceof Error ? error.message : String(error)}). Photo upload needs the sharp image library, which prebuilt binaries do not include; install with npm to attach photos.`
    );
  }
}
function formatPaprikaDate(date) {
  const pad = (value) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
var BASE_URL, LOGIN_URL, PaprikaClient;
var init_api = __esm({
  "src/api.ts"() {
    "use strict";
    init_esm_shims();
    BASE_URL = "https://paprikaapp.com/api/v2";
    LOGIN_URL = "https://paprikaapp.com/api/v1/account/login/";
    PaprikaClient = class {
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
      async request(endpoint, options = {}) {
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
        const client = new PaprikaWriteClient(this.email, this.password);
        await client.authenticate();
        await client.saveRecipe({
          uid: recipe.uid,
          hash: recipe.hash,
          name: recipe.name,
          categories: recipe.categories,
          ingredients: recipe.ingredients,
          directions: recipe.directions,
          description: recipe.description,
          notes: recipe.notes,
          prepTime: recipe.prep_time,
          cookTime: recipe.cook_time,
          totalTime: recipe.total_time,
          servings: recipe.servings,
          difficulty: recipe.difficulty,
          rating: recipe.rating,
          created: recipe.created,
          imageUrl: recipe.image_url,
          photo: recipe.photo,
          photoHash: recipe.photo_hash,
          photoLarge: recipe.photo_large,
          photoUrl: recipe.photo_url,
          source: recipe.source,
          sourceUrl: recipe.source_url,
          onFavorites: recipe.on_favorites,
          inTrash: recipe.in_trash,
          isPinned: recipe.is_pinned,
          onGroceryList: recipe.on_grocery_list,
          scale: recipe.scale,
          nutritionalInfo: recipe.nutritional_info,
          deleted: false
        });
        await client.notifySync();
        return recipe;
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
       * uses the verified three-request uploader from mcp-paprika.
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
        const client = new PaprikaWriteClient(this.email, this.password);
        await client.authenticate();
        await client.uploadPhoto(
          this.toSyncRecipe(recipeWithPhoto),
          {
            uid: photoUid,
            recipeUid: recipe.uid,
            filename: `${photoUid}.jpg`,
            name: "1",
            orderFlag: 0,
            hash: sha256Hex(full),
            deleted: false
          },
          thumbnail,
          full
        );
        await client.notifySync();
        return recipeWithPhoto;
      }
      toSyncRecipe(recipe) {
        return {
          uid: recipe.uid,
          hash: recipe.hash,
          name: recipe.name,
          categories: recipe.categories,
          ingredients: recipe.ingredients,
          directions: recipe.directions,
          description: recipe.description,
          notes: recipe.notes,
          prepTime: recipe.prep_time,
          cookTime: recipe.cook_time,
          totalTime: recipe.total_time,
          servings: recipe.servings,
          difficulty: recipe.difficulty,
          rating: recipe.rating,
          created: recipe.created,
          imageUrl: recipe.image_url,
          photo: recipe.photo,
          photoHash: recipe.photo_hash,
          photoLarge: recipe.photo_large,
          photoUrl: recipe.photo_url,
          source: recipe.source,
          sourceUrl: recipe.source_url,
          onFavorites: recipe.on_favorites,
          inTrash: recipe.in_trash,
          isPinned: recipe.is_pinned,
          onGroceryList: recipe.on_grocery_list,
          scale: recipe.scale,
          nutritionalInfo: recipe.nutritional_info,
          deleted: false
        };
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
  }
});

// src/types.ts
var ExitCode;
var init_types = __esm({
  "src/types.ts"() {
    "use strict";
    init_esm_shims();
    ExitCode = {
      Success: 0,
      Failure: 1,
      InvalidUsage: 2,
      AuthFailure: 3
    };
  }
});

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
function setNoColor(value) {
  forceNoColor = value;
}
function colorsEnabled() {
  return !forceNoColor && !shouldDisableColor();
}
function colorize(text, color) {
  if (!colorsEnabled()) {
    return text;
  }
  return `${colors[color]}${text}${colors.reset}`;
}
function printError(message) {
  console.error(style.error("Error:"), message);
}
function printSuccess(message) {
  console.log(style.success("\u2713"), message);
}
var forceNoColor, colors, style;
var init_output = __esm({
  "src/output.ts"() {
    "use strict";
    init_esm_shims();
    forceNoColor = false;
    colors = {
      reset: "\x1B[0m",
      red: "\x1B[31m",
      green: "\x1B[32m",
      yellow: "\x1B[33m",
      blue: "\x1B[34m",
      cyan: "\x1B[36m",
      dim: "\x1B[2m",
      bold: "\x1B[1m"
    };
    style = {
      error: (text) => colorize(text, "red"),
      success: (text) => colorize(text, "green"),
      warn: (text) => colorize(text, "yellow"),
      info: (text) => colorize(text, "blue"),
      cyan: (text) => colorize(text, "cyan"),
      dim: (text) => colorize(text, "dim"),
      bold: (text) => colorize(text, "bold")
    };
  }
});

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
function clearConfig() {
  for (const file of [configFile(), legacyConfigFile()]) {
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
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
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    init_esm_shims();
    init_types();
    init_output();
  }
});

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
function loadRecipeInput(file, index) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync2(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not read recipe JSON from ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (Array.isArray(parsed)) {
    if (index === void 0 || !Number.isInteger(index) || index < 0 || index >= parsed.length) {
      throw new Error(`Recipe input is an array; pass --index 0 through ${Math.max(0, parsed.length - 1)} to select one recipe.`);
    }
    parsed = parsed[index];
  }
  return parseRecipeInput(parsed);
}
function splitCategories(value) {
  const categories = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (categories.length === 0) throw new Error("--categories must contain at least one category name or UID.");
  return categories;
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
var MEAL_TYPES;
var init_core = __esm({
  "src/core.ts"() {
    "use strict";
    init_esm_shims();
    MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];
  }
});

// package.json
var package_default;
var init_package = __esm({
  "package.json"() {
    package_default = {
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
        "@bojanrajkovic/mcp-paprika": "^1.6.0",
        "@modelcontextprotocol/sdk": "^1.32.2",
        commander: "^13.0.0",
        zod: "^3.25.76"
      },
      devDependencies: {
        "@types/node": "^22.10.0",
        tsup: "^8.3.5",
        typescript: "^5.7.0",
        vitest: "^3.2.7"
      }
    };
  }
});

// src/version.ts
var VERSION;
var init_version = __esm({
  "src/version.ts"() {
    "use strict";
    init_esm_shims();
    init_package();
    VERSION = package_default.version;
  }
});

// src/mcp.ts
var mcp_exports = {};
__export(mcp_exports, {
  WRITES_ENV_VAR: () => WRITES_ENV_VAR,
  createServer: () => createServer,
  serveStdio: () => serveStdio,
  writesEnabled: () => writesEnabled
});
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
function writesEnabled(env = process.env) {
  return env[WRITES_ENV_VAR] === "1";
}
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
var WRITES_ENV_VAR, recipeInputSchema;
var init_mcp = __esm({
  "src/mcp.ts"() {
    "use strict";
    init_esm_shims();
    init_api();
    init_config();
    init_core();
    init_version();
    WRITES_ENV_VAR = "PAPRIKA_MCP_ENABLE_WRITES";
    recipeInputSchema = z.object({
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
  }
});

// src/cli.ts
init_esm_shims();
init_api();
init_config();
init_core();
init_types();
init_output();
init_version();
import { Command } from "commander";
import { createInterface } from "readline";
var program = new Command();
program.name("paprika").description("Unofficial CLI for Paprika Recipe Manager").version(VERSION, "-V, --version", "Show version number").option("--no-color", "Disable colored output").configureOutput({
  writeErr: (str) => process.stderr.write(str),
  writeOut: (str) => process.stdout.write(str),
  outputError: (str, write) => write(str)
}).exitOverride((err) => {
  if (err.code === "commander.missingArgument" || err.code === "commander.unknownOption" || err.code === "commander.invalidArgument" || err.code === "commander.missingMandatoryOptionValue") {
    process.exit(ExitCode.InvalidUsage);
  }
  process.exit(err.exitCode);
}).hook("preAction", (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts.color === false) {
    setNoColor(true);
  }
});
function prompt(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    if (hidden && process.stdin.isTTY) {
      process.stdout.write(question);
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");
      let password = "";
      const onData = (char) => {
        if (char === "\n" || char === "\r" || char === "") {
          stdin.setRawMode(false);
          stdin.removeListener("data", onData);
          rl.close();
          process.stdout.write("\n");
          resolve(password);
        } else if (char === "") {
          stdin.setRawMode(false);
          rl.close();
          process.exit(ExitCode.Failure);
        } else if (char === "\x7F" || char === "\b") {
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
        } else {
          password += char;
        }
      };
      stdin.on("data", onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}
program.command("auth").description("Authenticate with Paprika cloud sync (interactive)").action(async () => {
  if (!process.stdin.isTTY) {
    printError("Interactive authentication requires a TTY.");
    printError(
      "For non-interactive use, set PAPRIKA_EMAIL and PAPRIKA_PASSWORD environment variables."
    );
    process.exit(ExitCode.InvalidUsage);
  }
  try {
    const email = await prompt("Email: ");
    const password = await prompt("Password: ", true);
    if (!email || !password) {
      printError("Email and password are required.");
      process.exit(ExitCode.InvalidUsage);
    }
    console.log("Verifying credentials...");
    const client = new PaprikaClient({ email, password });
    const token = await client.login();
    saveConfig({ email, password, token });
    printSuccess("Authenticated successfully.");
    console.log(style.dim(`Config saved to ${getConfigPath()}`));
  } catch (error) {
    printError(
      `Authentication failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(ExitCode.AuthFailure);
  }
});
program.command("logout").description("Clear stored credentials").action(() => {
  clearConfig();
  printSuccess("Credentials cleared.");
});
program.command("whoami").description("Show current authenticated user").option("--json", "Output as JSON").action((options) => {
  const config = loadConfig();
  if (!config) {
    if (options.json) {
      console.log(JSON.stringify({ authenticated: false }));
    } else {
      console.log("Not authenticated. Run: paprika auth");
    }
    return;
  }
  if (options.json) {
    console.log(
      JSON.stringify({ authenticated: true, email: config.email }, null, 2)
    );
  } else {
    console.log(`Authenticated as: ${style.bold(config.email)}`);
  }
});
program.command("recipes").description("List all recipes").option("--json", "Output as JSON").option("--category <category>", "Filter by category name").action(async (options) => {
  const config = requireConfig();
  const client = new PaprikaClient(config);
  try {
    if (!options.json) {
      console.log("Fetching recipes...");
    }
    const active = await listRecipes(client, options.category);
    if (options.json) {
      console.log(JSON.stringify(active, null, 2));
    } else {
      const categoryMsg = options.category ? ` in category "${options.category}"` : "";
      console.log(`
Found ${active.length} recipes${categoryMsg}:
`);
      for (const recipe of active.sort(
        (a, b) => a.name.localeCompare(b.name)
      )) {
        const rating = recipe.rating > 0 ? style.dim(` (${recipe.rating}\u2605)`) : "";
        console.log(`\u2022 ${style.bold(recipe.name)}${rating}`);
      }
    }
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    process.exit(ExitCode.Failure);
  }
});
program.command("recipe").description("Get a recipe by UID or name").argument("<identifier>", "Recipe UID or name (partial match supported)").option("--json", "Output as JSON").option("--ingredients-only", "Only show ingredients").action(
  async (identifier, options) => {
    const config = requireConfig();
    const client = new PaprikaClient(config);
    try {
      if (!options.json) {
        console.log("Searching recipes...");
      }
      const recipe = await findRecipe(client, identifier);
      if (!recipe) {
        printError(`Recipe not found: ${identifier}`);
        process.exit(ExitCode.Failure);
      }
      if (options.json) {
        console.log(JSON.stringify(recipe, null, 2));
      } else if (options.ingredientsOnly) {
        console.log(`
Ingredients for "${recipe.name}":
`);
        console.log(recipe.ingredients);
      } else {
        printRecipe(recipe);
      }
    } catch (error) {
      printError(error instanceof Error ? error.message : String(error));
      process.exit(ExitCode.Failure);
    }
  }
);
program.command("search").description("Search recipes by name or description").argument("<query>", "Search query").option("--json", "Output as JSON").action(async (query, options) => {
  const config = requireConfig();
  const client = new PaprikaClient(config);
  try {
    if (!options.json) {
      console.log("Searching recipes...");
    }
    const active = await searchRecipes(client, query);
    if (options.json) {
      console.log(JSON.stringify(active, null, 2));
    } else if (active.length === 0) {
      console.log(`No recipes found matching "${query}"`);
    } else {
      console.log(`
Found ${active.length} recipes matching "${query}":
`);
      for (const recipe of active) {
        console.log(`\u2022 ${style.bold(recipe.name)}`);
      }
    }
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    process.exit(ExitCode.Failure);
  }
});
program.command("recipe-create").description("Create a recipe from a JSON file (preview by default; use --yes to upload)").argument("<file>", "Recipe JSON file").option("--index <index>", "Select a recipe from a JSON array (zero-based)", Number.parseInt).option("--categories <names>", "Comma-separated category names or UIDs; overrides input categories").option("--yes", "Upload the recipe to Paprika cloud sync").option("--json", "Output the resolved recipe as JSON").action(async (file, options) => {
  const config = requireConfig();
  const client = new PaprikaClient(config);
  try {
    const input = loadRecipeInput(file, options.index);
    const result = await createRecipe(client, input, {
      categoryOverride: options.categories ? splitCategories(options.categories) : void 0,
      confirm: options.yes === true
    });
    printWriteResult(result, options.json);
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    process.exit(ExitCode.Failure);
  }
});
program.command("recipe-update").description("Replace recipe fields from a JSON file (preview by default; use --yes to upload)").argument("<identifier>", "Recipe UID or exact recipe name").argument("<file>", "Complete replacement recipe JSON file").option("--index <index>", "Select a recipe from a JSON array (zero-based)", Number.parseInt).option("--categories <names>", "Comma-separated category names or UIDs; overrides input categories").option("--yes", "Upload the replacement to Paprika cloud sync").option("--json", "Output the resolved recipe as JSON").action(async (identifier, file, options) => {
  const config = requireConfig();
  const client = new PaprikaClient(config);
  try {
    const input = loadRecipeInput(file, options.index);
    const result = await updateRecipe(client, identifier, input, {
      categoryOverride: options.categories ? splitCategories(options.categories) : void 0,
      confirm: options.yes === true
    });
    printWriteResult(result, options.json);
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    process.exit(ExitCode.Failure);
  }
});
program.command("meals").description("Show meal plan").option("--json", "Output as JSON").option("--date <date>", "Filter by date (YYYY-MM-DD)").action(async (options) => {
  const config = requireConfig();
  const client = new PaprikaClient(config);
  try {
    const meals = await listMeals(client, options.date);
    if (options.json) {
      console.log(JSON.stringify(meals, null, 2));
    } else if (meals.length === 0) {
      console.log("No meals planned.");
    } else {
      const byDate = /* @__PURE__ */ new Map();
      for (const meal of meals) {
        const existing = byDate.get(meal.date) ?? [];
        existing.push(meal);
        byDate.set(meal.date, existing);
      }
      for (const [date, dateMeals] of [...byDate.entries()].sort()) {
        console.log(`
${style.bold(date)}:`);
        for (const meal of dateMeals.sort((a, b) => a.type - b.type)) {
          const type = MEAL_TYPES[meal.type] ?? "Other";
          console.log(`  ${style.dim(type + ":")} ${meal.name}`);
        }
      }
    }
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    process.exit(ExitCode.Failure);
  }
});
program.command("groceries").description("Show grocery list").option("--json", "Output as JSON").option("--all", "Include purchased items").action(async (options) => {
  const config = requireConfig();
  const client = new PaprikaClient(config);
  try {
    const filtered = await listGroceries(client, options.all ?? false);
    if (options.json) {
      console.log(JSON.stringify(filtered, null, 2));
    } else if (filtered.length === 0) {
      console.log("Grocery list is empty.");
    } else {
      const byAisle = /* @__PURE__ */ new Map();
      for (const item of filtered) {
        const aisle = item.aisle || "Uncategorized";
        const existing = byAisle.get(aisle) ?? [];
        existing.push(item);
        byAisle.set(aisle, existing);
      }
      console.log(`
Grocery list (${filtered.length} items):
`);
      for (const [aisle, aisleItems] of [...byAisle.entries()].sort()) {
        console.log(`${style.bold(aisle)}:`);
        for (const item of aisleItems) {
          const qty = item.quantity ? `${item.quantity} ` : "";
          const purchased = item.purchased ? style.dim(" \u2713") : "";
          console.log(`  \u2022 ${qty}${item.name}${purchased}`);
        }
      }
    }
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    process.exit(ExitCode.Failure);
  }
});
program.command("categories").description("List recipe categories").option("--json", "Output as JSON").action(async (options) => {
  const config = requireConfig();
  const client = new PaprikaClient(config);
  try {
    const categories = await client.getCategories();
    if (options.json) {
      console.log(JSON.stringify(categories, null, 2));
    } else {
      console.log("\nCategories:\n");
      for (const cat of categories.sort(
        (a, b) => a.name.localeCompare(b.name)
      )) {
        console.log(`\u2022 ${cat.name}`);
      }
    }
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    process.exit(ExitCode.Failure);
  }
});
program.command("serve").alias("mcp").description("Start the MCP server on stdio (writes need PAPRIKA_MCP_ENABLE_WRITES=1)").action(async () => {
  const { serveStdio: serveStdio2 } = await Promise.resolve().then(() => (init_mcp(), mcp_exports));
  await serveStdio2();
});
function printRecipe(recipe) {
  console.log(`
${"=".repeat(50)}`);
  console.log(style.bold(recipe.name));
  console.log("=".repeat(50));
  if (recipe.description) {
    console.log(`
${recipe.description}`);
  }
  const meta = [];
  if (recipe.prep_time) meta.push(`Prep: ${recipe.prep_time}`);
  if (recipe.cook_time) meta.push(`Cook: ${recipe.cook_time}`);
  if (recipe.total_time) meta.push(`Total: ${recipe.total_time}`);
  if (recipe.servings) meta.push(`Servings: ${recipe.servings}`);
  if (recipe.difficulty) meta.push(`Difficulty: ${recipe.difficulty}`);
  if (recipe.rating > 0) meta.push(`Rating: ${recipe.rating}\u2605`);
  if (meta.length > 0) {
    console.log(`
${style.dim(meta.join(" | "))}`);
  }
  if (recipe.source) {
    console.log(`
${style.dim("Source:")} ${recipe.source}`);
    if (recipe.source_url) {
      console.log(`${style.dim("URL:")} ${recipe.source_url}`);
    }
  }
  if (recipe.ingredients) {
    console.log(`
${style.bold("--- Ingredients ---")}`);
    console.log(recipe.ingredients);
  }
  if (recipe.directions) {
    console.log(`
${style.bold("--- Directions ---")}`);
    console.log(recipe.directions);
  }
  if (recipe.notes) {
    console.log(`
${style.bold("--- Notes ---")}`);
    console.log(recipe.notes);
  }
  if (recipe.nutritional_info) {
    console.log(`
${style.bold("--- Nutrition ---")}`);
    console.log(recipe.nutritional_info);
  }
  console.log("");
}
function printWriteResult(result, json2) {
  const { recipe } = result;
  if (json2) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.dry_run) {
    const action = result.action === "would create" ? "Would create" : "Would update";
    console.log(`
${action}: ${style.bold(recipe.name)}`);
    console.log(style.dim(`UID: ${recipe.uid}`));
    console.log(style.dim(`Categories: ${recipe.categories.length || "none"}`));
    console.log(style.dim(`Ingredients: ${recipe.ingredients.split("\n").filter(Boolean).length} lines; directions: ${recipe.directions.split("\n").filter(Boolean).length} lines${recipe.photo ? "; photo attached" : ""}
`));
    console.log(style.dim("No cloud changes made. Re-run with --yes after reviewing the recipe."));
    return;
  }
  printSuccess(`${result.action === "created" ? "Created" : "Updated"} recipe: ${recipe.name}`);
  console.log(style.dim(`UID: ${recipe.uid}. Paprika sync has been notified.`));
}
program.parse();
