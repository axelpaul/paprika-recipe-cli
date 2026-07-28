/**
 * Paprika API Client
 *
 * REST client for Paprika Recipe Manager cloud sync API.
 */

import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { PaprikaClient as PaprikaWriteClient } from "@bojanrajkovic/mcp-paprika/dist/paprika/client.js";
import type { Recipe as PaprikaSyncRecipe } from "@bojanrajkovic/mcp-paprika/dist/paprika/types.js";
import { normalizePhoto, sha256Hex } from "@bojanrajkovic/mcp-paprika/dist/tools/photo-helpers.js";
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

const BASE_URL = "https://paprikaapp.com/api/v2";
const LOGIN_URL = "https://paprikaapp.com/api/v1/account/login/";

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
   * gzipped JSON document in a multipart `data` field. The server accepts an
   * empty hash for a new recipe; edits retain the existing server hash.
   */
  private async saveRecipe(recipe: Recipe): Promise<Recipe> {
    // Reuse the maintained community sync writer for the fragile write path.
    // It is the same private API, but has captured wire-level coverage for
    // Paprika's multipart recipe writes.
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
      deleted: false,
    } as unknown as PaprikaSyncRecipe);
    await client.notifySync();
    return recipe;
  }

  /** Create a new recipe and notify Paprika clients to refresh. */
  async createRecipe(input: RecipeInput, categories: string[]): Promise<Recipe> {
    const recipe = this.recipeFromInput(input, categories);
    const saved = await this.saveRecipe(recipe);
    return this.attachImportedPhoto(saved, input.photo_data);
  }

  /** Build a write-ready recipe without changing the cloud. */
  async previewRecipe(input: RecipeInput, categories: string[], existing?: Recipe): Promise<Recipe> {
    return this.recipeFromInput(input, categories, existing);
  }

  /** Update an existing recipe, preserving its fields unless input overrides them. */
  async updateRecipe(existing: Recipe, input: RecipeInput, categories: string[]): Promise<Recipe> {
    const recipe = this.recipeFromInput(input, categories, existing);
    const saved = await this.saveRecipe(recipe);
    return this.attachImportedPhoto(saved, input.photo_data);
  }

  /** Builds a write-ready recipe without changing the cloud. */
  private recipeFromInput(input: RecipeInput, categories: string[], existing?: Recipe): Recipe {
    const created = existing?.created ?? formatPaprikaDate(new Date());
    const recipe: Recipe = {
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
      photo_url: existing?.photo_url ?? null,
    };
    // The current sync service accepts an empty hash for a new recipe (as the
    // desktop client does); for edits retain the server's existing hash. A
    // guessed hash algorithm is rejected with a generic 500, so do not invent
    // one here.
    recipe.hash = existing?.hash ?? "";
    return recipe;
  }

  /**
   * Attach an image embedded in a `.paprikarecipes`-style import record.
   * Paprika stores a thumbnail and full JPEG separately, so this intentionally
   * uses the verified three-request uploader from mcp-paprika.
   */
  private async attachImportedPhoto(recipe: Recipe, photoData?: string): Promise<Recipe> {
    if (!photoData || recipe.photo) return recipe;
    const encoded = photoData.replace(/^data:[^;]+;base64,/i, "");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0) throw new Error("photo_data is empty or invalid base64.");

    const { thumbnail, full } = await normalizePhoto(bytes);
    const photoUid = randomUUID().toUpperCase();
    const thumbnailUid = randomUUID().toUpperCase();
    const recipeWithPhoto: Recipe = {
      ...recipe,
      photo: `${thumbnailUid}.jpg`,
      photo_large: `${photoUid}.jpg`,
      photo_hash: sha256Hex(thumbnail),
    };
    const client = new PaprikaWriteClient(this.email, this.password);
    await client.authenticate();
    await client.uploadPhoto(
      this.toSyncRecipe(recipeWithPhoto),
      {
        uid: photoUid as never,
        recipeUid: recipe.uid as never,
        filename: `${photoUid}.jpg`,
        name: "1",
        orderFlag: 0,
        hash: sha256Hex(full),
        deleted: false,
      },
      thumbnail,
      full,
    );
    await client.notifySync();
    return recipeWithPhoto;
  }

  private toSyncRecipe(recipe: Recipe): PaprikaSyncRecipe {
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
      deleted: false,
    } as unknown as PaprikaSyncRecipe;
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
        (r.description ?? "").toLowerCase().includes(lowerQuery)
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
