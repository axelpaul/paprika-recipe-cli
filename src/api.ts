/**
 * Paprika API Client
 *
 * REST client for Paprika Recipe Manager cloud sync API.
 */

import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type {
  PaprikaConfig,
  Recipe,
  RecipeStub,
  Meal,
  GroceryItem,
  Category,
  ApiResponse,
  RecipeInput,
} from "./types.js";

const BASE_URL = "https://www.paprikaapp.com/api/v2";
const LOGIN_URL = "https://www.paprikaapp.com/api/v1/account/login/";

interface LoginResponse {
  result: {
    token: string;
  };
  error?: {
    code: number;
    message: string;
  };
}

export class PaprikaClient {
  private email: string;
  private password: string;
  private token: string | null = null;

  constructor(config: PaprikaConfig) {
    this.email = config.email;
    this.password = config.password;
    this.token = config.token ?? null;
  }

  /**
   * Login to get JWT token
   */
  async login(): Promise<string> {
    if (this.token) {
      return this.token;
    }

    const response = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `email=${encodeURIComponent(this.email)}&password=${encodeURIComponent(this.password)}`,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Login failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as LoginResponse;

    if (data.error) {
      throw new Error(`Login error: ${data.error.message}`);
    }

    this.token = data.result.token;
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Ensure we have a token
    const token = await this.login();

    const url = `${BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    // Paprika returns gzip-compressed JSON
    const buffer = await response.arrayBuffer();
    let data: string;

    try {
      // Try to decompress gzip
      const decompressed = gunzipSync(Buffer.from(buffer));
      data = decompressed.toString("utf-8");
    } catch {
      // If not gzipped, use as-is
      data = Buffer.from(buffer).toString("utf-8");
    }

    const parsed = JSON.parse(data) as ApiResponse<T>;

    if (parsed.error) {
      throw new Error(`Paprika API error: ${parsed.error.message}`);
    }

    return parsed.result;
  }

  /**
   * Write a recipe using Paprika's private sync protocol. The app expects a
   * gzipped JSON document in a multipart `data` field, plus a content hash it
   * uses for change detection.
   */
  private async saveRecipe(recipe: Recipe): Promise<Recipe> {
    const token = await this.login();
    const payload = {
      uid: recipe.uid,
      hash: recipe.hash,
      name: recipe.name,
      categories: recipe.categories,
      ingredients: recipe.ingredients,
      directions: recipe.directions,
      description: recipe.description,
      notes: recipe.notes,
      nutritional_info: recipe.nutritional_info,
      servings: recipe.servings,
      difficulty: recipe.difficulty,
      prep_time: recipe.prep_time,
      cook_time: recipe.cook_time,
      total_time: recipe.total_time,
      source: recipe.source,
      source_url: recipe.source_url,
      image_url: recipe.image_url,
      photo: recipe.photo,
      photo_hash: recipe.photo_hash,
      photo_large: recipe.photo_large,
      on_favorites: recipe.on_favorites,
      in_trash: recipe.in_trash,
      is_pinned: recipe.is_pinned,
      scale: recipe.scale,
      rating: recipe.rating,
      deleted: false,
    };
    const form = new FormData();
    form.append("data", new Blob([gzipSync(JSON.stringify(payload))]), "data.gz");
    const response = await fetch(`${BASE_URL}/sync/recipe/${recipe.uid}/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${await response.text()}`);
    }
    const parsed = (await response.json()) as ApiResponse<boolean>;
    if (parsed.error || parsed.result !== true) {
      throw new Error(`Paprika API error: ${parsed.error?.message ?? "recipe save was not confirmed"}`);
    }
    await this.request<unknown>("/sync/notify/", { method: "POST" });
    return recipe;
  }

  /** Create a new recipe and notify Paprika clients to refresh. */
  async createRecipe(input: RecipeInput, categories: string[]): Promise<Recipe> {
    const recipe = this.recipeFromInput(input, categories);
    return this.saveRecipe(recipe);
  }

  /** Build a write-ready recipe without changing the cloud. */
  async previewRecipe(input: RecipeInput, categories: string[], existing?: Recipe): Promise<Recipe> {
    return this.recipeFromInput(input, categories, existing);
  }

  /** Update an existing recipe, preserving its fields unless input overrides them. */
  async updateRecipe(existing: Recipe, input: RecipeInput, categories: string[]): Promise<Recipe> {
    const recipe = this.recipeFromInput(input, categories, existing);
    return this.saveRecipe(recipe);
  }

  /** Builds a write-ready recipe and matches Paprika's client-side hash algorithm. */
  private recipeFromInput(input: RecipeInput, categories: string[], existing?: Recipe): Recipe {
    const created = existing?.created ?? formatPaprikaDate(new Date());
    const recipe: Recipe = {
      uid: existing?.uid ?? randomUUID().toUpperCase(),
      hash: "",
      name: input.name,
      categories,
      ingredients: input.ingredients,
      directions: input.directions,
      description: input.description ?? existing?.description ?? "",
      notes: input.notes ?? existing?.notes ?? "",
      nutritional_info: input.nutritional_info ?? existing?.nutritional_info ?? "",
      servings: input.servings ?? existing?.servings ?? "",
      difficulty: input.difficulty ?? existing?.difficulty ?? "",
      prep_time: input.prep_time ?? existing?.prep_time ?? "",
      cook_time: input.cook_time ?? existing?.cook_time ?? "",
      total_time: input.total_time ?? existing?.total_time ?? "",
      source: input.source ?? existing?.source ?? "",
      source_url: input.source_url ?? existing?.source_url ?? "",
      image_url: input.image_url ?? existing?.image_url ?? "",
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
      photo_url: existing?.photo_url ?? null,
    };
    recipe.hash = computeRecipeHash(recipe);
    return recipe;
  }

  /**
   * Get list of all recipe stubs (uid + hash only)
   */
  async getRecipeList(): Promise<RecipeStub[]> {
    return this.request<RecipeStub[]>("/sync/recipes/");
  }

  /**
   * Get full recipe by UID
   */
  async getRecipe(uid: string): Promise<Recipe> {
    return this.request<Recipe>(`/sync/recipe/${uid}/`);
  }

  /**
   * Get all recipes with full details
   */
  async getAllRecipes(): Promise<Recipe[]> {
    const stubs = await this.getRecipeList();
    const recipes: Recipe[] = [];

    // Fetch in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < stubs.length; i += batchSize) {
      const batch = stubs.slice(i, i + batchSize);
      const batchRecipes = await Promise.all(
        batch.map((stub) => this.getRecipe(stub.uid))
      );
      recipes.push(...batchRecipes);

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < stubs.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return recipes;
  }

  /**
   * Get all meals
   */
  async getMeals(): Promise<Meal[]> {
    return this.request<Meal[]>("/sync/meals/");
  }

  /**
   * Get all grocery items
   */
  async getGroceries(): Promise<GroceryItem[]> {
    return this.request<GroceryItem[]>("/sync/groceries/");
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<Category[]> {
    return this.request<Category[]>("/sync/categories/");
  }

  /**
   * Search recipes by name (local filter after fetching all)
   */
  async searchRecipes(query: string): Promise<Recipe[]> {
    const recipes = await this.getAllRecipes();
    const lowerQuery = query.toLowerCase();
    return recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(lowerQuery) ||
        r.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get recipe by exact or partial name match
   */
  async findRecipeByName(name: string): Promise<Recipe | null> {
    const recipes = await this.getAllRecipes();
    const lowerName = name.toLowerCase();

    // Try exact match first
    const exact = recipes.find((r) => r.name.toLowerCase() === lowerName);
    if (exact) return exact;

    // Then try partial match
    const partial = recipes.find((r) =>
      r.name.toLowerCase().includes(lowerName)
    );
    return partial ?? null;
  }
}

function formatPaprikaDate(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Matches Paprika.framework's recipe content hash, verified by community clients. */
export function computeRecipeHash(recipe: Recipe): string {
  const values: unknown[] = [
    [...recipe.categories].sort(), recipe.cook_time ?? "", recipe.created, false,
    recipe.description ?? "", recipe.difficulty ?? "", recipe.directions ?? "", null,
    recipe.image_url, false, recipe.ingredients ?? "", recipe.is_pinned, recipe.name,
    recipe.notes ?? "", recipe.nutritional_info ?? "", recipe.on_favorites, recipe.photo,
    recipe.photo_hash, recipe.photo_large, recipe.prep_time ?? "", recipe.rating, recipe.scale,
    recipe.servings ?? "", recipe.source ?? "", recipe.source_url ?? "", recipe.total_time ?? "", recipe.uid,
  ];
  const json = JSON.stringify(values).replaceAll("/", "\\/");
  return createHash("sha256").update(json, "utf8").digest("hex").toUpperCase();
}
