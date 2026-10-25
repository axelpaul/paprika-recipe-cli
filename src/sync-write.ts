/**
 * Paprika cloud-sync write helpers.
 *
 * Adapted from @bojanrajkovic/mcp-paprika (MIT, Copyright (c) 2026 Bojan
 * Rajkovic, https://github.com/bojanrajkovic/mcp-paprika), whose wire format
 * was derived from captured Paprika.app traffic. Only the pieces this CLI needs
 * are kept here, so installing the CLI does not pull in that package's full MCP
 * server dependency tree.
 */

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { Recipe } from "./types.js";

/** Longest edge (px) of the recipe thumbnail Paprika stores in `recipe.photo`. */
const THUMBNAIL_PX = 280;

/** The recipe fields Paprika.app sends on a recipe POST. */
export function recipeToApiPayload(recipe: Recipe): Record<string, unknown> {
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
    deleted: false,
  };
}

export interface PhotoEntity {
  uid: string;
  recipe_uid: string;
  filename: string;
  name: string;
  order_flag: number;
  hash: string;
  deleted: boolean;
}

/** Multipart body with a gzipped JSON `data` part. */
export function entityFormData(payload: unknown, filename = "file"): FormData {
  const form = new FormData();
  form.append("data", new Blob([gzipSync(JSON.stringify(payload))]), filename);
  return form;
}

/** Like {@link entityFormData} plus a raw JPEG `photo_upload` part. */
export function photoFormData(payload: unknown, image: Buffer, imageFilename: string, dataFilename = "file"): FormData {
  const form = entityFormData(payload, dataFilename);
  form.append("photo_upload", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), imageFilename);
  return form;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

/**
 * Normalise arbitrary image bytes into the two JPEGs Paprika stores per photo:
 * the full image and a ~280px thumbnail. `sharp` is loaded lazily (and is an
 * optional dependency) so only photo uploads need it.
 */
export async function normalizePhoto(input: Buffer): Promise<{ thumbnail: Buffer; full: Buffer }> {
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default;
  } catch (error) {
    throw new Error(
      `the sharp image library is not available (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const base = sharp(input).rotate();
  const [full, thumbnail] = await Promise.all([
    base.clone().jpeg({ quality: 85 }).toBuffer(),
    base
      .clone()
      .resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer(),
  ]);
  return { thumbnail, full };
}
