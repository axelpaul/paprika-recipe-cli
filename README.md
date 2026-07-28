# paprika-recipe-cli

> **⚠️ Unofficial CLI for Paprika Recipe Manager**  
> Not affiliated with or endorsed by Hindsight Labs LLC.

A command-line interface for [Paprika Recipe Manager](https://www.paprikaapp.com). Access your recipes, meal plans, and grocery lists from the terminal. Recipe create/update commands include an explicit confirmation gate and can attach an embedded recipe photo.

> **API caution:** Paprika does not publish this cloud-sync API as a supported public API. It may change or stop working without notice. Use it with a synced backup of your recipes and review every write preview before supplying `--yes`.

## Installation

```bash
npm install -g paprika-recipe-cli
```

Or run directly with npx:

```bash
npx paprika-recipe-cli --help
```

## Quick Start

```bash
# Authenticate (interactive)
paprika auth

# List your recipes
paprika recipes

# Search for a recipe
paprika search "chicken"

# View a recipe
paprika recipe "Pasta Carbonara"

# Check your grocery list
paprika groceries
```

## Commands

### Authentication

```bash
paprika auth              # Interactive login
paprika logout            # Clear stored credentials
paprika whoami            # Show current user
```

### Recipes

```bash
paprika recipes                        # List all recipes
paprika recipes --category "Dinner"    # Filter by category
paprika recipes --json                 # Output as JSON

paprika recipe "Pasta Carbonara"       # View by name
paprika recipe <uid>                   # View by UID
paprika recipe "Pasta" --ingredients-only
paprika recipe "Pasta" --json

paprika search "chicken"               # Search recipes
paprika search "quick dinner" --json
```

### Create or update recipes

Recipe writes use Paprika's cloud-sync API. They are deliberately preview-only
unless `--yes` is supplied, so a script or agent cannot create a recipe merely
by preparing its input.

```bash
# Inspect the exact recipe that would be created; no cloud change is made.
paprika recipe-create examples/recipe.json

# Create it and notify Paprika clients to sync.
paprika recipe-create examples/recipe.json --yes

# Select one recipe from an existing JSON import batch, overriding categories.
paprika recipe-create data/import-batch.json --index 0 --categories "kloi-import,NYT Cooking,Dinner" --yes

# Replace a recipe's editable fields from a complete JSON recipe document.
paprika recipe-update "Example Tomato Pasta" examples/recipe.json
paprika recipe-update "Example Tomato Pasta" examples/recipe.json --yes
```

The input must contain `name`, `ingredients`, and `directions`. Optional fields
include `description`, `notes`, `servings`, `prep_time`, `cook_time`,
`total_time`, `source`, `source_url`, `image_url`, `rating`, `is_pinned`,
`on_favorites`, and `categories`. Categories may be category names or UIDs and
are resolved before saving. `photo_data`, when present, is decoded from base64,
normalised to Paprika's full-size JPEG plus thumbnail, and attached after the
recipe is saved. See [`examples/recipe.json`](examples/recipe.json).

Existing recipes with a photo are left alone: the command will not silently add
a second one. Replacing an existing photo will be an explicit follow-up command.

### Meal Planning

```bash
paprika meals                   # Show all planned meals
paprika meals --date 2026-01-08 # Filter by date
paprika meals --json
```

### Groceries

```bash
paprika groceries        # Show unpurchased items
paprika groceries --all  # Include purchased items
paprika groceries --json
```

### Categories

```bash
paprika categories       # List all categories
paprika categories --json
```

## Options

Global flags available on all commands:

| Flag | Description |
|------|-------------|
| `-h, --help` | Show help |
| `-V, --version` | Show version number |
| `--no-color` | Disable colored output |
| `--json` | Output as JSON (where applicable) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PAPRIKA_EMAIL` | Email for authentication |
| `PAPRIKA_PASSWORD` | Password for authentication |
| `NO_COLOR` | Disable colored output (any value) |

For non-interactive use (scripts, CI/CD), set both `PAPRIKA_EMAIL` and `PAPRIKA_PASSWORD` environment variables.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Generic failure |
| `2` | Invalid usage (bad arguments) |
| `3` | Authentication failure |

## Examples

### Export all recipes to JSON

```bash
paprika recipes --json > my-recipes.json
```

### Get ingredients for a recipe

```bash
paprika recipe "Spaghetti" --ingredients-only
```

### Script: Check if a recipe exists

```bash
if paprika recipe "Lasagna" --json > /dev/null 2>&1; then
  echo "Recipe found!"
fi
```

### View this week's meal plan

```bash
# Get meals for a specific date
paprika meals --date $(date +%Y-%m-%d)
```

## API Client

This package also exports a TypeScript client for programmatic use:

```typescript
import { PaprikaClient } from 'paprika-recipe-cli';

const client = new PaprikaClient({
  email: process.env.PAPRIKA_EMAIL,
  password: process.env.PAPRIKA_PASSWORD,
});

const recipes = await client.getAllRecipes();
const meals = await client.getMeals();
const groceries = await client.getGroceries();
```

## Development

```bash
git clone https://github.com/axelpaul/paprika-recipe-cli
cd paprika-recipe-cli
npm install
npm run build
node dist/cli.js --help
```

## License

MIT. Originally created by [Matt Russell](https://github.com/mjrussell); this fork is maintained by [Axel Gunnarsson](https://github.com/axelpaul).

## Disclaimer

This is an unofficial tool created by the community. Paprika Recipe Manager is a trademark of Hindsight Labs LLC. This project is not affiliated with, endorsed by, or connected to Hindsight Labs LLC in any way.

Requires a Paprika Recipe Manager account with cloud sync enabled.
