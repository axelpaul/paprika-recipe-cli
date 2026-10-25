/**
 * MCP server exposing the CLI's capabilities as tools.
 *
 * Every tool goes through the same PaprikaClient and shared helpers in
 * core.ts that the CLI commands use. Nothing here may write to stdout except
 * the MCP protocol itself.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PaprikaClient } from "./api.js";
import { findConfig } from "./config.js";
import {
  MEAL_TYPES,
  createRecipe,
  findRecipe,
  listGroceries,
  listMeals,
  listRecipes,
  parseRecipeInput,
  searchRecipes,
  updateRecipe,
} from "./core.js";
import type { Recipe } from "./types.js";
import { VERSION } from "./version.js";

export const WRITES_ENV_VAR = "PAPRIKA_MCP_ENABLE_WRITES";

export function writesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[WRITES_ENV_VAR] === "1";
}

const recipeInputSchema = z
  .object({
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
    photo_data: z
      .string()
      .min(1)
      .optional()
      .describe("Base64 image bytes; uploaded as the recipe photo if the recipe has none yet"),
  })
  .describe("Recipe document, same format as the CLI's recipe JSON file");

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function json(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function summary(recipe: Recipe) {
  return {
    uid: recipe.uid,
    name: recipe.name,
    categories: recipe.categories,
    rating: recipe.rating,
    description: recipe.description,
    total_time: recipe.total_time,
    servings: recipe.servings,
  };
}

export interface ServerOptions {
  /** Override the client (tests). */
  client?: PaprikaClient;
  env?: NodeJS.ProcessEnv;
}

export function createServer(options: ServerOptions = {}): McpServer {
  const env = options.env ?? process.env;
  const server = new McpServer({ name: "paprika", version: VERSION });

  let cached: PaprikaClient | undefined = options.client;
  const getClient = (): PaprikaClient => {
    if (cached) return cached;
    const found = findConfig();
    if (!found) {
      throw new Error(
        "Not authenticated. Set PAPRIKA_EMAIL and PAPRIKA_PASSWORD in the MCP server's env, or run `paprika auth` once.",
      );
    }
    cached = new PaprikaClient(found.config);
    return cached;
  };

  const run =
    <A>(fn: (args: A) => Promise<unknown>) =>
    async (args: A): Promise<ToolResult> => {
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
      annotations: { readOnlyHint: true },
    },
    run(async () => {
      const found = findConfig();
      return found ? { authenticated: true, email: found.config.email, source: found.source } : { authenticated: false };
    }),
  );

  server.registerTool(
    "list_recipes",
    {
      description:
        "List all recipes not in the trash (same as `paprika recipes`). Returns summaries unless full=true. Category filter matches category names partially, case-insensitively.",
      inputSchema: {
        category: z.string().optional().describe("Filter by category name (partial match)"),
        full: z.boolean().optional().describe("Return complete recipe objects instead of summaries"),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ category, full }: { category?: string; full?: boolean }) => {
      const recipes = (await listRecipes(getClient(), category)).sort((a, b) => a.name.localeCompare(b.name));
      return full ? recipes : recipes.map(summary);
    }),
  );

  server.registerTool(
    "search_recipes",
    {
      description: "Search recipes by name or description (same as `paprika search`). Returns summaries unless full=true.",
      inputSchema: {
        query: z.string().min(1).describe("Text to look for in recipe names and descriptions"),
        full: z.boolean().optional().describe("Return complete recipe objects instead of summaries"),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ query, full }: { query: string; full?: boolean }) => {
      const recipes = await searchRecipes(getClient(), query);
      return full ? recipes : recipes.map(summary);
    }),
  );

  server.registerTool(
    "get_recipe",
    {
      description: "Get one recipe by UID or name (exact match first, then partial). Same as `paprika recipe`.",
      inputSchema: {
        identifier: z.string().min(1).describe("Recipe UID or name"),
        ingredients_only: z.boolean().optional().describe("Return only name and ingredients"),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ identifier, ingredients_only }: { identifier: string; ingredients_only?: boolean }) => {
      const recipe = await findRecipe(getClient(), identifier);
      if (!recipe) throw new Error(`Recipe not found: ${identifier}`);
      return ingredients_only ? { uid: recipe.uid, name: recipe.name, ingredients: recipe.ingredients } : recipe;
    }),
  );

  server.registerTool(
    "list_categories",
    {
      description: "List recipe categories with their UIDs (same as `paprika categories`).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    run(async () => (await getClient().getCategories()).sort((a, b) => a.name.localeCompare(b.name))),
  );

  server.registerTool(
    "list_meals",
    {
      description: "Show the meal plan, optionally for a single date (same as `paprika meals`).",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Only meals on this date (YYYY-MM-DD)"),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ date }: { date?: string }) => {
      const meals = await listMeals(getClient(), date);
      return meals
        .map((m) => ({ ...m, type_name: MEAL_TYPES[m.type] ?? "Other" }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.type - b.type);
    }),
  );

  server.registerTool(
    "list_groceries",
    {
      description: "Show the grocery list; unpurchased items only unless all=true (same as `paprika groceries`).",
      inputSchema: {
        all: z.boolean().optional().describe("Include purchased items"),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ all }: { all?: boolean }) => listGroceries(getClient(), all ?? false)),
  );

  if (writesEnabled(env)) {
    server.registerTool(
      "create_recipe",
      {
        description:
          "Create a recipe in Paprika (same as `paprika recipe-create`). With confirm=false (default) it only returns a preview and changes nothing; set confirm=true to upload.",
        inputSchema: {
          recipe: recipeInputSchema,
          categories: z
            .array(z.string())
            .optional()
            .describe("Category names or UIDs; overrides recipe.categories"),
          confirm: z.boolean().optional().describe("Must be true to actually create the recipe"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      run(async ({ recipe, categories, confirm }: { recipe: unknown; categories?: string[]; confirm?: boolean }) =>
        createRecipe(getClient(), parseRecipeInput(recipe), { categoryOverride: categories, confirm: confirm === true }),
      ),
    );

    server.registerTool(
      "update_recipe",
      {
        description:
          "Replace an existing recipe's editable fields (same as `paprika recipe-update`). Omitted optional fields keep their current values. With confirm=false (default) it only returns a preview; set confirm=true to upload.",
        inputSchema: {
          identifier: z.string().min(1).describe("Recipe UID or name"),
          recipe: recipeInputSchema,
          categories: z
            .array(z.string())
            .optional()
            .describe("Category names or UIDs; overrides recipe.categories (default: keep existing)"),
          confirm: z.boolean().optional().describe("Must be true to actually update the recipe"),
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      run(
        async ({
          identifier,
          recipe,
          categories,
          confirm,
        }: {
          identifier: string;
          recipe: unknown;
          categories?: string[];
          confirm?: boolean;
        }) =>
          updateRecipe(getClient(), identifier, parseRecipeInput(recipe), {
            categoryOverride: categories,
            confirm: confirm === true,
          }),
      ),
    );
  }

  return server;
}

export async function serveStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `paprika MCP server ${VERSION} running on stdio (writes ${writesEnabled() ? "enabled" : `disabled; set ${WRITES_ENV_VAR}=1 to enable`})\n`,
  );
}
