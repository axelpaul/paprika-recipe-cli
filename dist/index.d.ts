import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Paprika API Types
 */
interface PaprikaConfig {
    email: string;
    password: string;
    token?: string;
}
interface RecipeStub {
    uid: string;
    hash: string;
}
interface Recipe {
    uid: string;
    name: string;
    ingredients: string;
    directions: string;
    description: string | null;
    notes: string | null;
    nutritional_info: string | null;
    servings: string | null;
    difficulty: string | null;
    prep_time: string | null;
    cook_time: string | null;
    total_time: string | null;
    source: string | null;
    source_url: string | null;
    image_url: string | null;
    photo: string | null;
    photo_hash: string | null;
    photo_large: string | null;
    scale: string | null;
    hash: string;
    categories: string[];
    rating: number;
    in_trash: boolean;
    is_pinned: boolean;
    on_favorites: boolean;
    on_grocery_list: boolean;
    created: string;
    photo_url: string | null;
}
/**
 * Portable input format used by `recipe-create` and `recipe-update`.
 * Categories may be Paprika category names or UIDs; names are resolved before
 * a recipe is saved.
 */
interface RecipeInput {
    name: string;
    ingredients: string;
    directions: string;
    description?: string;
    notes?: string;
    nutritional_info?: string;
    servings?: string;
    difficulty?: string;
    prep_time?: string;
    cook_time?: string;
    total_time?: string;
    source?: string;
    source_url?: string;
    image_url?: string;
    categories?: string[];
    rating?: number;
    is_pinned?: boolean;
    on_favorites?: boolean;
    /** Base64 image bytes from a Paprika import JSON; uploaded after the recipe. */
    photo_data?: string;
}
interface Meal {
    uid: string;
    recipe_uid: string | null;
    name: string;
    date: string;
    type: number;
    order_flag: number;
}
interface GroceryItem {
    uid: string;
    name: string;
    ingredient: string;
    recipe_uid: string | null;
    aisle: string;
    quantity: string;
    purchased: boolean;
    order_flag: number;
}
interface Category {
    uid: string;
    name: string;
    order_flag: number;
    parent_uid: string | null;
}
interface SyncStatusResponse {
    recipes: number;
    meals: number;
    groceries: number;
    categories: number;
    bookmarks: number;
    menus: number;
    menuitems: number;
    pantry: number;
}
interface ApiResponse<T> {
    result: T;
    error?: {
        code: number;
        message: string;
    };
}
/**
 * Exit codes following CLI conventions
 */
declare const ExitCode: {
    readonly Success: 0;
    readonly Failure: 1;
    readonly InvalidUsage: 2;
    readonly AuthFailure: 3;
};

/**
 * Paprika API Client
 *
 * REST client for Paprika Recipe Manager cloud sync API.
 */

declare class PaprikaClient {
    private email;
    private password;
    private token;
    constructor(config: PaprikaConfig);
    /**
     * Login to get JWT token
     */
    login(): Promise<string>;
    private request;
    /**
     * Write a recipe using Paprika's private sync protocol. The app expects a
     * gzipped JSON document in a multipart `data` field. The server accepts an
     * empty hash for a new recipe; edits retain the existing server hash.
     */
    private saveRecipe;
    private postRecipe;
    /** Ask Paprika to tell the user's other devices to sync. */
    private notifySync;
    /** Create a new recipe and notify Paprika clients to refresh. */
    createRecipe(input: RecipeInput, categories: string[]): Promise<Recipe>;
    /** Build a write-ready recipe without changing the cloud. */
    previewRecipe(input: RecipeInput, categories: string[], existing?: Recipe): Promise<Recipe>;
    /** Update an existing recipe, preserving its fields unless input overrides them. */
    updateRecipe(existing: Recipe, input: RecipeInput, categories: string[]): Promise<Recipe>;
    /** Builds a write-ready recipe without changing the cloud. */
    private recipeFromInput;
    /**
     * Attach an image embedded in a `.paprikarecipes`-style import record.
     * Paprika stores a thumbnail and full JPEG separately, so this intentionally
     * uses the three-request upload sequence captured from Paprika.app.
     */
    private attachImportedPhoto;
    /**
     * Get list of all recipe stubs (uid + hash only)
     */
    getRecipeList(): Promise<RecipeStub[]>;
    /**
     * Get full recipe by UID
     */
    getRecipe(uid: string): Promise<Recipe>;
    /**
     * Get all recipes with full details
     */
    getAllRecipes(): Promise<Recipe[]>;
    /**
     * Get all meals
     */
    getMeals(): Promise<Meal[]>;
    /**
     * Get all grocery items
     */
    getGroceries(): Promise<GroceryItem[]>;
    /**
     * Get all categories
     */
    getCategories(): Promise<Category[]>;
    /**
     * Search recipes by name (local filter after fetching all)
     */
    searchRecipes(query: string): Promise<Recipe[]>;
    /**
     * Get recipe by exact or partial name match
     */
    findRecipeByName(name: string): Promise<Recipe | null>;
}

/**
 * Get the path to the config file
 */
declare function getConfigPath(): string;
/**
 * Load config from file
 */
declare function loadConfig(): PaprikaConfig | null;
/**
 * Save config to file
 */
declare function saveConfig(config: PaprikaConfig): void;
/**
 * Get config, preferring env vars over file
 * Exits with appropriate code if not configured
 */
declare function requireConfig(): PaprikaConfig;

/**
 * MCP server exposing the CLI's capabilities as tools.
 *
 * Every tool goes through the same PaprikaClient and shared helpers in
 * core.ts that the CLI commands use. Nothing here may write to stdout except
 * the MCP protocol itself.
 */

declare const WRITES_ENV_VAR = "PAPRIKA_MCP_ENABLE_WRITES";
interface ServerOptions {
    /** Override the client (tests). */
    client?: PaprikaClient;
    env?: NodeJS.ProcessEnv;
}
declare function createServer(options?: ServerOptions): McpServer;
declare function serveStdio(): Promise<void>;

/** Package version, read from package.json at build time. */
declare const VERSION: string;

export { type ApiResponse, type Category, ExitCode, type GroceryItem, type Meal, PaprikaClient, type PaprikaConfig, type Recipe, type RecipeInput, type RecipeStub, type SyncStatusResponse, VERSION, WRITES_ENV_VAR, createServer, getConfigPath, loadConfig, requireConfig, saveConfig, serveStdio };
