/**
 * Paprika API Types
 */

export interface PaprikaConfig {
  email: string;
  password: string;
  token?: string;
}

export interface RecipeStub {
  uid: string;
  hash: string;
}

export interface Recipe {
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
export interface RecipeInput {
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

export interface Meal {
  uid: string;
  recipe_uid: string | null;
  name: string;
  date: string; // YYYY-MM-DD
  type: number; // 0=breakfast, 1=lunch, 2=dinner, 3=snack
  order_flag: number;
}

export interface GroceryItem {
  uid: string;
  name: string;
  ingredient: string;
  recipe_uid: string | null;
  aisle: string;
  quantity: string;
  purchased: boolean;
  order_flag: number;
}

export interface Category {
  uid: string;
  name: string;
  order_flag: number;
  parent_uid: string | null;
}

export interface SyncStatusResponse {
  recipes: number;
  meals: number;
  groceries: number;
  categories: number;
  bookmarks: number;
  menus: number;
  menuitems: number;
  pantry: number;
}

export interface ApiResponse<T> {
  result: T;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Exit codes following CLI conventions
 */
export const ExitCode = {
  Success: 0,
  Failure: 1,
  InvalidUsage: 2,
  AuthFailure: 3,
} as const;
