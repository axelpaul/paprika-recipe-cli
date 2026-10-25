import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node18",
  splitting: false,
  sourcemap: false,
  shims: true,
  // Optional native dependency, loaded lazily at runtime for photo uploads.
  external: ["sharp"],
});
