/**
 * Shared operations used by both the CLI commands and the MCP server, so the
 * two surfaces cannot drift apart.
 */

import { readFileSync } from "node:fs";
import type { PaprikaClient } from "./api.js";
import type { Category, GroceryItem, Meal, Recipe, RecipeInput } from "./types.js";

/** Check if a string looks like a UUID. */
export function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/** All non-trashed recipes, optionally filtered by a (partial, case-insensitive) category name. */
export async function listRecipes(client: PaprikaClient, category?: string): Promise<Recipe[]> {
  const recipes = await client.getAllRecipes();
  let active = recipes.filter((r) => !r.in_trash);
  if (category) {
    // Recipes reference categories by UID, so match the query against category
    // names first (partial, case-insensitive), then against the raw values.
    const categoryLower = category.toLowerCase();
    const categories = await client.getCategories();
    const matchingUids = new Set(
      categories.filter((c) => c.name.toLowerCase().includes(categoryLower)).map((c) => c.uid),
    );
    active = active.filter((r) =>
      r.categories.some((c) => matchingUids.has(c) || c.toLowerCase().includes(categoryLower)),
    );
  }
  return active;
}

/** Non-trashed recipes whose name or description contains the query. */
export async function searchRecipes(client: PaprikaClient, query: string): Promise<Recipe[]> {
  const recipes = await client.searchRecipes(query);
  return recipes.filter((r) => !r.in_trash);
}

/** Look a recipe up by UID (when it looks like one) or by exact-then-partial name. */
export async function findRecipe(client: PaprikaClient, identifier: string): Promise<Recipe | null> {
  if (isUuid(identifier)) {
    try {
      return await client.getRecipe(identifier);
    } catch {
      // UID not found, fall through to name search
    }
  }
  return client.findRecipeByName(identifier);
}

/** Meal plan entries, optionally limited to one date (YYYY-MM-DD). */
export async function listMeals(client: PaprikaClient, date?: string): Promise<Meal[]> {
  const meals = await client.getMeals();
  return date ? meals.filter((m) => m.date === date) : meals;
}

/** Grocery items; unpurchased only unless `all` is set. */
export async function listGroceries(client: PaprikaClient, all = false): Promise<GroceryItem[]> {
  const items = await client.getGroceries();
  return all ? items : items.filter((i) => !i.purchased);
}

export const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

/** Validate an untyped value as a recipe write input (same rules for CLI and MCP). */
export function parseRecipeInput(parsed: unknown): RecipeInput {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Recipe input must be a JSON object.");
  }
  const value = parsed as Record<string, unknown>;
  for (const field of ["name", "ingredients", "directions"] as const) {
    const fieldValue = value[field];
    if (typeof fieldValue !== "string" || !fieldValue.trim()) {
      throw new Error(`Recipe input requires a non-empty string: ${field}`);
    }
  }
  if (
    value.categories !== undefined &&
    (!Array.isArray(value.categories) || value.categories.some((item) => typeof item !== "string"))
  ) {
    throw new Error("categories must be an array of Paprika category names or UIDs.");
  }
  if (value.photo_data !== undefined && (typeof value.photo_data !== "string" || value.photo_data.length === 0)) {
    throw new Error("photo_data must be a non-empty base64 string.");
  }
  if (value.rating !== undefined) {
    const rating = value.rating;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 0 || rating > 5) {
      throw new Error("rating must be an integer from 0 to 5.");
    }
  }
  return value as unknown as RecipeInput;
}

/** Read a recipe input from a JSON file (object, or array + index). */
export function loadRecipeInput(file: string, index?: number): RecipeInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not read recipe JSON from ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (Array.isArray(parsed)) {
    if (index === undefined || !Number.isInteger(index) || index < 0 || index >= parsed.length) {
      throw new Error(`Recipe input is an array; pass --index 0 through ${Math.max(0, parsed.length - 1)} to select one recipe.`);
    }
    parsed = parsed[index];
  }
  return parseRecipeInput(parsed);
}

export function splitCategories(value: string): string[] {
  const categories = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (categories.length === 0) throw new Error("--categories must contain at least one category name or UID.");
  return categories;
}

/** Resolve category names or UIDs to UIDs, failing on unknown or ambiguous names. */
export async function resolveCategories(client: PaprikaClient, values: string[]): Promise<string[]> {
  if (values.length === 0) return [];
  const categories = await client.getCategories();
  const resolved: string[] = [];
  for (const value of values) {
    if (isUuid(value)) {
      resolved.push(value);
      continue;
    }
    // Prefer an exact label before falling back to case-insensitive matching:
    // a library can legitimately contain both "Dinner" and "dinner".
    const exactMatches = categories.filter((category: Category) => category.name === value);
    const matches =
      exactMatches.length > 0
        ? exactMatches
        : categories.filter((category: Category) => category.name.toLowerCase() === value.toLowerCase());
    if (matches.length === 0) throw new Error(`Paprika category not found: ${value}`);
    if (matches.length > 1) throw new Error(`Paprika category is ambiguous: ${value}. Use its UID instead.`);
    resolved.push(matches[0]!.uid);
  }
  return [...new Set(resolved)];
}

export interface WriteResult {
  action: "would create" | "would update" | "created" | "updated";
  dry_run: boolean;
  recipe: Recipe;
}

/**
 * Create a recipe. Without `confirm` this is a preview only: nothing is sent
 * to Paprika. `categoryOverride` replaces the input's categories.
 */
export async function createRecipe(
  client: PaprikaClient,
  input: RecipeInput,
  opts: { categoryOverride?: string[]; confirm?: boolean } = {},
): Promise<WriteResult> {
  const categoryUids = await resolveCategories(client, opts.categoryOverride ?? input.categories ?? []);
  if (!opts.confirm) {
    return { action: "would create", dry_run: true, recipe: await client.previewRecipe(input, categoryUids) };
  }
  return { action: "created", dry_run: false, recipe: await client.createRecipe(input, categoryUids) };
}

/**
 * Replace an existing recipe's editable fields. Without `confirm` this is a
 * preview only.
 */
export async function updateRecipe(
  client: PaprikaClient,
  identifier: string,
  input: RecipeInput,
  opts: { categoryOverride?: string[]; confirm?: boolean } = {},
): Promise<WriteResult> {
  const existing = isUuid(identifier) ? await client.getRecipe(identifier) : await client.findRecipeByName(identifier);
  if (!existing) throw new Error(`Recipe not found: ${identifier}`);
  const categoryUids = await resolveCategories(client, opts.categoryOverride ?? input.categories ?? existing.categories);
  if (!opts.confirm) {
    return {
      action: "would update",
      dry_run: true,
      recipe: await client.previewRecipe(input, categoryUids, existing),
    };
  }
  return { action: "updated", dry_run: false, recipe: await client.updateRecipe(existing, input, categoryUids) };
}
