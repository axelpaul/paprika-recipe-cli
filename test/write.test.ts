import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaprikaClient } from "../src/api.js";
import { normalizePhoto } from "../src/sync-write.js";

// 1x1 PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface Call {
  url: string;
  method: string;
  parts: Record<string, Blob>;
}

function mockFetch() {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const parts: Record<string, Blob> = {};
    if (init.body instanceof FormData) {
      for (const [k, v] of init.body.entries()) parts[k] = v as Blob;
    }
    calls.push({ url, method: init.method ?? "GET", parts });
    return new Response(JSON.stringify({ result: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

async function data(blob: Blob | undefined): Promise<Record<string, unknown>> {
  return JSON.parse(gunzipSync(Buffer.from(await blob!.arrayBuffer())).toString("utf8"));
}

afterEach(() => vi.unstubAllGlobals());

describe("recipe writes", () => {
  const client = () => new PaprikaClient({ email: "jon@example.com", password: "x", token: "tok" });

  it("posts a gzipped recipe then notifies sync", async () => {
    const calls = mockFetch();
    const recipe = await client().createRecipe({ name: "Soup", ingredients: "water", directions: "boil" }, ["CAT-1"]);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST https://paprikaapp.com/api/v2/sync/recipe/${recipe.uid}/`,
      "POST https://paprikaapp.com/api/v2/sync/notify/",
    ]);
    const payload = await data(calls[0]!.parts["data"]);
    expect(payload).toMatchObject({ uid: recipe.uid, name: "Soup", categories: ["CAT-1"], hash: "", deleted: false, image_url: null });
    expect(payload).not.toHaveProperty("photo_url");
  });

  it("uploads photo_data with the three-request sequence", async () => {
    const calls = mockFetch();
    const recipe = await client().createRecipe({ name: "Soup", ingredients: "water", directions: "boil", photo_data: PNG }, []);
    expect(calls.map((c) => c.url.replace(/[0-9A-F-]{36}/g, "UID"))).toEqual([
      "https://paprikaapp.com/api/v2/sync/recipe/UID/",
      "https://paprikaapp.com/api/v2/sync/notify/",
      "https://paprikaapp.com/api/v2/sync/recipe/UID/",
      "https://paprikaapp.com/api/v2/sync/photo/UID/",
      "https://paprikaapp.com/api/v2/sync/recipe/UID/",
      "https://paprikaapp.com/api/v2/sync/notify/",
    ]);
    expect(calls[2]!.parts["photo_upload"]).toBeDefined();
    expect(calls[3]!.parts["photo_upload"]).toBeDefined();
    const photo = await data(calls[3]!.parts["data"]);
    expect(photo).toMatchObject({ recipe_uid: recipe.uid, name: "1", order_flag: 0, deleted: false });
    expect(recipe.photo_large).toBe(`${photo["uid"] as string}.jpg`);
  });

  it("rejects bad photo_data before writing anything", async () => {
    const calls = mockFetch();
    await expect(
      client().createRecipe({ name: "Soup", ingredients: "water", directions: "boil", photo_data: "bm90IGFuIGltYWdl" }, []),
    ).rejects.toThrow(/photo_data/);
    expect(calls).toHaveLength(0);
  });

  it("normalizes images to JPEG", async () => {
    const { full, thumbnail } = await normalizePhoto(Buffer.from(PNG, "base64"));
    expect(full.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(thumbnail.subarray(0, 2).toString("hex")).toBe("ffd8");
  });
});
