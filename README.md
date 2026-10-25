# paprika-recipe-cli

Command-line tool and MCP server for [Paprika Recipe Manager](https://www.paprikaapp.com): recipes, meal plans, grocery lists, and safe recipe create/update.

> **Unofficial — not affiliated with Paprika or Hindsight Labs LLC.**

> **API caution:** Paprika does not publish this cloud-sync API as a supported public API. It may change or stop working without notice. Keep a synced backup of your recipes and review every write preview before confirming it.

Originally created by [Matt Russell](https://github.com/mjrussell); this fork (write support, MCP server) is maintained by [Axel Paul Gunnarsson](https://github.com/axelpaul).

## Install

Requires [Node.js](https://nodejs.org) 18 or newer and npm. Photo upload uses the optional native `sharp` library, which npm installs automatically on supported platforms.

```sh
npm install -g github:axelpaul/paprika-recipe-cli   # install
npm install -g github:axelpaul/paprika-recipe-cli   # update (re-run; pulls latest main)
npm uninstall -g paprika-recipe-cli                  # uninstall
```

The built JavaScript in `dist/` is committed, so installing from GitHub needs no build step.

With [Bun](https://bun.sh) (≥ 1.1) instead:

```sh
bun add -g github:axelpaul/paprika-recipe-cli   # install / update
bun remove -g paprika-recipe-cli                 # uninstall
```

The command still runs on Node (`#!/usr/bin/env node`). Bun blocks `sharp`'s install script by default, so photo upload may need `bun pm -g trust sharp`.

**Prebuilt binaries:** download `paprika-<os>-<arch>` for Linux, macOS or Windows from the [Releases page](https://github.com/axelpaul/paprika-recipe-cli/releases), check it against `SHA256SUMS`, make it executable and put it on your `PATH`. The binaries do everything except attaching a photo from `photo_data` (that needs the native `sharp` image library; use the npm install for it).

## Authentication

Paprika uses your Paprika cloud-sync email and password.

```sh
paprika auth      # interactive login; stores email, password and token in the config file (mode 600)
paprika whoami    # show the stored account
paprika logout    # delete the stored credentials
```

For scripts, CI and MCP clients, set `PAPRIKA_EMAIL` and `PAPRIKA_PASSWORD` instead; environment variables take precedence over the config file.

## CLI usage

```sh
paprika recipes                        # list all recipes
paprika recipes --category "Dinner"    # filter by category name (partial match)
paprika recipes --json                 # full recipe objects as JSON

paprika recipe "Pasta Carbonara"       # view by name (exact match, then partial)
paprika recipe <uid>                   # view by UID
paprika recipe "Pasta" --ingredients-only
paprika recipe "Pasta" --json

paprika search "chicken"               # search names and descriptions
paprika search "quick dinner" --json

paprika meals                          # meal plan
paprika meals --date 2026-01-08        # one day
paprika groceries                      # unpurchased grocery items
paprika groceries --all                # include purchased items
paprika categories                     # categories (with --json for UIDs)
```

Global flags: `-h, --help`, `-V, --version`, `--no-color` (or `NO_COLOR`), and `--json` on most commands.

### Create or update recipes

Recipe writes use Paprika's cloud-sync API. They are preview-only unless `--yes` is supplied, so a script or agent cannot create a recipe merely by preparing its input.

```sh
# Inspect the exact recipe that would be created; no cloud change is made.
paprika recipe-create examples/recipe.json

# Create it and notify Paprika clients to sync.
paprika recipe-create examples/recipe.json --yes

# Select one recipe from a JSON array, overriding categories.
paprika recipe-create import-batch.json --index 0 --categories "Imported,Dinner" --yes

# Replace a recipe's editable fields from a complete JSON recipe document.
paprika recipe-update "Example Tomato Pasta" examples/recipe.json
paprika recipe-update "Example Tomato Pasta" examples/recipe.json --yes
```

The input must contain `name`, `ingredients`, and `directions`. Optional fields: `description`, `notes`, `nutritional_info`, `servings`, `difficulty`, `prep_time`, `cook_time`, `total_time`, `source`, `source_url`, `image_url`, `rating` (0–5), `is_pinned`, `on_favorites`, and `categories`. Categories may be names or UIDs and are resolved before saving; unknown or ambiguous names are an error. On update, omitted optional fields keep their current values. See [`examples/recipe.json`](examples/recipe.json).

`photo_data`, when present, is decoded from base64, normalised to Paprika's full-size JPEG plus thumbnail, and attached after the recipe is saved. Recipes that already have a photo are left alone; the command will not silently add a second one.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Generic failure |
| `2` | Invalid usage (bad arguments) |
| `3` | Authentication failure |

## MCP server

`paprika serve` starts an MCP server on stdio (`paprika mcp` is an alias). Every tool uses the same client code as the CLI command named next to it.

| Tool | Access | Description |
|------|--------|-------------|
| `whoami` | read | Whether credentials are configured, the account email, and their source (env/file) |
| `list_recipes` | read | Recipes not in the trash, optional `category` name filter; summaries unless `full: true` (`paprika recipes`) |
| `search_recipes` | read | Search names and descriptions (`paprika search`) |
| `get_recipe` | read | One recipe by UID or name, optional `ingredients_only` (`paprika recipe`) |
| `list_categories` | read | Categories with UIDs (`paprika categories`) |
| `list_meals` | read | Meal plan, optional `date` (YYYY-MM-DD) (`paprika meals`) |
| `list_groceries` | read | Grocery list, `all: true` to include purchased items (`paprika groceries`) |
| `create_recipe` | write | Create a recipe (`paprika recipe-create`) |
| `update_recipe` | write | Replace a recipe's fields (`paprika recipe-update`) |

Write tools are only listed when the server is started with `PAPRIKA_MCP_ENABLE_WRITES=1`. Even then they return a preview and change nothing unless the call passes `confirm: true` (the MCP equivalent of `--yes`). `auth`/`logout` are not exposed: configure credentials with env vars or by running `paprika auth` once.

Claude Code:

```sh
claude mcp add paprika -e PAPRIKA_EMAIL=you@example.com -e PAPRIKA_PASSWORD=... -- paprika serve
```

(Leave out the `-e` flags if you have already run `paprika auth`.)

Claude Desktop, Cursor and other JSON-configured clients:

```json
{
  "mcpServers": {
    "paprika": {
      "command": "paprika",
      "args": ["serve"],
      "env": {
        "PAPRIKA_EMAIL": "you@example.com",
        "PAPRIKA_PASSWORD": "your-password",
        "PAPRIKA_MCP_ENABLE_WRITES": "1"
      }
    }
  }
}
```

Drop `PAPRIKA_MCP_ENABLE_WRITES` to keep the server read-only. GUI apps may not have npm's global bin directory (or `~/.bun/bin`) on their `PATH`; if the server fails to start, use the absolute path from `which paprika` as `command`.

## Configuration

| Variable | Description |
|----------|-------------|
| `PAPRIKA_EMAIL` | Paprika account email (with `PAPRIKA_PASSWORD`, overrides the config file) |
| `PAPRIKA_PASSWORD` | Paprika account password |
| `PAPRIKA_MCP_ENABLE_WRITES` | Set to `1` to expose `create_recipe` / `update_recipe` in the MCP server |
| `XDG_CONFIG_HOME` | Base directory for the config file (default `~/.config`) |
| `NO_COLOR` | Disable colored output (any value) |

Credentials saved by `paprika auth` live in `$XDG_CONFIG_HOME/paprika-recipe-cli/config.json` (default `~/.config/paprika-recipe-cli/config.json`, file mode 600). A config file from older versions at `~/.config/paprika-cli/config.json` is still read. Nothing is cached on disk.

### Library use

The package also exports the TypeScript client:

```typescript
import { PaprikaClient } from "paprika-recipe-cli";

const client = new PaprikaClient({
  email: process.env.PAPRIKA_EMAIL!,
  password: process.env.PAPRIKA_PASSWORD!,
});

const recipes = await client.getAllRecipes();
const meals = await client.getMeals();
const groceries = await client.getGroceries();
```

## Development

```sh
git clone https://github.com/axelpaul/paprika-recipe-cli
cd paprika-recipe-cli
npm install
npm run check        # typecheck, build, tests
node dist/cli.js --help
```

`dist/` is committed so `npm install -g github:...` works (npm and Bun do not reliably run build scripts for global git installs). After changing `src/`, run `npm run build` and commit `dist/` too; CI fails if it is stale.

Shared logic used by both the CLI and the MCP server is in `src/core.ts`; tools are in `src/mcp.ts`. The recipe/photo write wire format in `src/sync-write.ts` is adapted from [`@bojanrajkovic/mcp-paprika`](https://github.com/bojanrajkovic/mcp-paprika) (MIT, Bojan Rajkovic). Pushing a `v*` tag builds binaries with `bun build --compile` and publishes a GitHub release.

## License

MIT. Originally created by [Matt Russell](https://github.com/mjrussell); this fork is maintained by [Axel Paul Gunnarsson](https://github.com/axelpaul).

Paprika Recipe Manager is a trademark of Hindsight Labs LLC. This project is not affiliated with, endorsed by, or connected to Hindsight Labs LLC in any way. Requires a Paprika account with cloud sync enabled.
