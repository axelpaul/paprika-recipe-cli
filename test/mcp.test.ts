import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { PaprikaClient } from "../src/api.js";
import { createServer } from "../src/mcp.js";
import type { Category, Recipe } from "../src/types.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

const READ_TOOLS = [
  "get_recipe",
  "list_categories",
  "list_groceries",
  "list_meals",
  "list_recipes",
  "search_recipes",
  "whoami",
];

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    uid: "00000000-0000-0000-0000-000000000001",
    name: "Example",
    ingredients: "1 egg",
    directions: "Cook it.",
    description: null,
    notes: null,
    nutritional_info: null,
    servings: null,
    difficulty: null,
    prep_time: null,
    cook_time: null,
    total_time: null,
    source: null,
    source_url: null,
    image_url: null,
    photo: null,
    photo_hash: null,
    photo_large: null,
    scale: null,
    hash: "",
    categories: [],
    rating: 0,
    in_trash: false,
    is_pinned: false,
    on_favorites: false,
    on_grocery_list: false,
    created: "2026-01-01 00:00:00",
    photo_url: null,
    ...overrides,
  };
}

const DINNER = "AAAAAAAA-0000-0000-0000-000000000001";
const categories: Category[] = [{ uid: DINNER, name: "Dinner", order_flag: 0, parent_uid: null }];
const recipes = [
  recipe({ uid: "00000000-0000-0000-0000-000000000001", name: "Tomato Pasta", categories: [DINNER] }),
  recipe({ uid: "00000000-0000-0000-0000-000000000002", name: "Pancakes" }),
  recipe({ uid: "00000000-0000-0000-0000-000000000003", name: "Old Soup", in_trash: true, categories: [DINNER] }),
];

function fakeClient() {
  return {
    getAllRecipes: vi.fn(async () => recipes),
    getCategories: vi.fn(async () => categories),
    getRecipe: vi.fn(async (uid: string) => recipes.find((r) => r.uid === uid) ?? Promise.reject(new Error("404"))),
    findRecipeByName: vi.fn(async (name: string) => recipes.find((r) => r.name.toLowerCase().includes(name.toLowerCase())) ?? null),
    searchRecipes: vi.fn(async (q: string) => recipes.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))),
    getMeals: vi.fn(async () => [
      { uid: "m1", recipe_uid: null, name: "Tomato Pasta", date: "2026-01-02", type: 2, order_flag: 0 },
      { uid: "m2", recipe_uid: null, name: "Pancakes", date: "2026-01-01", type: 0, order_flag: 0 },
    ]),
    getGroceries: vi.fn(async () => [
      { uid: "g1", name: "Eggs", ingredient: "eggs", recipe_uid: null, aisle: "", quantity: "6", purchased: false, order_flag: 0 },
      { uid: "g2", name: "Milk", ingredient: "milk", recipe_uid: null, aisle: "", quantity: "", purchased: true, order_flag: 0 },
    ]),
    previewRecipe: vi.fn(async (input: { name: string }, cats: string[]) => recipe({ name: input.name, categories: cats })),
    createRecipe: vi.fn(async (input: { name: string }, cats: string[]) => recipe({ name: input.name, categories: cats })),
    updateRecipe: vi.fn(async (existing: Recipe, input: { name: string }, cats: string[]) => ({ ...existing, name: input.name, categories: cats })),
  };
}

async function connect(env: NodeJS.ProcessEnv = {}, client = fakeClient()) {
  const server = createServer({ env, client: client as unknown as PaprikaClient });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), mcp.connect(b)]);
  return { mcp, client };
}

function parse(result: unknown): unknown {
  const r = result as { content: { text: string }[]; isError?: boolean };
  if (r.isError) throw new Error(r.content[0]?.text);
  return JSON.parse(r.content[0]!.text);
}

describe("mcp server", () => {
  it("lists only read tools without the writes env var", async () => {
    const { mcp } = await connect();
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(READ_TOOLS);
  });

  it("adds write tools with PAPRIKA_MCP_ENABLE_WRITES=1", async () => {
    const { mcp } = await connect({ PAPRIKA_MCP_ENABLE_WRITES: "1" });
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...READ_TOOLS, "create_recipe", "update_recipe"].sort());
  });

  it("reports the package version", async () => {
    const { mcp } = await connect();
    expect(mcp.getServerVersion()?.version).toBe(pkg.version);
  });

  it("filters recipes by category name and hides trashed ones", async () => {
    const { mcp } = await connect();
    const out = parse(await mcp.callTool({ name: "list_recipes", arguments: { category: "dinn" } })) as { name: string }[];
    expect(out.map((r) => r.name)).toEqual(["Tomato Pasta"]);
  });

  it("gets a recipe by name", async () => {
    const { mcp } = await connect();
    const out = parse(await mcp.callTool({ name: "get_recipe", arguments: { identifier: "pancakes", ingredients_only: true } }));
    expect(out).toEqual({ uid: "00000000-0000-0000-0000-000000000002", name: "Pancakes", ingredients: "1 egg" });
  });

  it("filters groceries and meals", async () => {
    const { mcp } = await connect();
    const groceries = parse(await mcp.callTool({ name: "list_groceries", arguments: {} })) as { name: string }[];
    expect(groceries.map((g) => g.name)).toEqual(["Eggs"]);
    const meals = parse(await mcp.callTool({ name: "list_meals", arguments: { date: "2026-01-02" } })) as { type_name: string }[];
    expect(meals).toHaveLength(1);
    expect(meals[0]!.type_name).toBe("Dinner");
  });

  it("previews create_recipe unless confirm=true", async () => {
    const { mcp, client } = await connect({ PAPRIKA_MCP_ENABLE_WRITES: "1" });
    const args = { recipe: { name: "New", ingredients: "x", directions: "y" }, categories: ["Dinner"] };
    const preview = parse(await mcp.callTool({ name: "create_recipe", arguments: args })) as { dry_run: boolean; recipe: Recipe };
    expect(preview.dry_run).toBe(true);
    expect(preview.recipe.categories).toEqual([DINNER]);
    expect(client.createRecipe).not.toHaveBeenCalled();

    const created = parse(await mcp.callTool({ name: "create_recipe", arguments: { ...args, confirm: true } })) as { action: string };
    expect(created.action).toBe("created");
    expect(client.createRecipe).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown categories on update", async () => {
    const { mcp, client } = await connect({ PAPRIKA_MCP_ENABLE_WRITES: "1" });
    const result = (await mcp.callTool({
      name: "update_recipe",
      arguments: { identifier: "Pancakes", recipe: { name: "P", ingredients: "x", directions: "y" }, categories: ["Nope"], confirm: true },
    })) as { isError?: boolean };
    expect(result.isError).toBe(true);
    expect(client.updateRecipe).not.toHaveBeenCalled();
  });
});

describe("built cli", () => {
  const cli = new URL("../dist/cli.js", import.meta.url).pathname;
  it("prints the package version", () => {
    expect(execFileSync("node", [cli, "--version"], { encoding: "utf8" }).trim()).toBe(pkg.version);
  });
  it("lists serve in --help", () => {
    expect(execFileSync("node", [cli, "--help"], { encoding: "utf8" })).toMatch(/serve\|mcp/);
  });
});
