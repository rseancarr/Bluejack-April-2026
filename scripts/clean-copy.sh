#!/usr/bin/env bash
# Make a clean, standalone copy of the app in a new folder, ready to push to a new GitHub repository.
#
#   bash scripts/clean-copy.sh                                   -> creates ~/freestone-portfolio
#   bash scripts/clean-copy.sh ~/somewhere/else                  -> creates that folder instead
#   bash scripts/clean-copy.sh ~/freestone-portfolio https://github.com/ORG/freestone-portfolio.git
#                                                                -> also points it at that (empty) repo and pushes
#
# Run it from inside the current project folder after `git pull`. It:
#   1. copies the code (full history) into the new folder and drops files unrelated to the app,
#   2. names the branch `main` and updates the hosting file to deploy from `main`,
#   3. copies the local-only files git never carries: .env (password, team, secret), the database
#      (tasks, imports, calendar links), uploaded files, and the accounting workbooks in samples/,
#   4. installs packages and brings the database up to date,
#   5. optionally pushes to the new repository.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$HOME/freestone-portfolio}"
REMOTE="${2:-}"
BRANCH="$(git -C "$SRC" rev-parse --abbrev-ref HEAD)"

if [ -e "$DEST" ]; then
  echo "✗ $DEST already exists. Pick another folder or move that one aside first."
  exit 1
fi

echo "→ Copying the code from $SRC (branch $BRANCH) to $DEST"
git clone --quiet --branch "$BRANCH" "$SRC" "$DEST"
cd "$DEST"
git remote remove origin

# Files from the original repository that are not part of the app.
for f in Itinerary; do
  if [ -e "$f" ]; then git rm -q "$f"; fi
done
# Hosting blueprint should deploy from main in the new repository.
if [ -f render.yaml ]; then
  sed -i.bak "s#^\(\s*branch:\).*#\1 main#" render.yaml && rm -f render.yaml.bak
  git add render.yaml
fi
git commit -q -m "Standalone copy: deploy from main; remove unrelated files" || true
git branch -M main
echo "→ Branch is now: main"

echo "→ Copying local-only files (never in git)"
copy() {
  if [ -d "$SRC/$1" ]; then mkdir -p "$DEST/$1"; cp -R "$SRC/$1/." "$DEST/$1/"; echo "   $1/"
  elif [ -e "$SRC/$1" ]; then mkdir -p "$(dirname "$DEST/$1")"; cp "$SRC/$1" "$DEST/$1"; echo "   $1"; fi
}
copy .env
copy prisma/dev.db
copy storage
for f in "$SRC"/samples/*.xlsx "$SRC"/samples/*.xlsm; do [ -e "$f" ] && copy "samples/$(basename "$f")"; done
for f in "$SRC"/samples/brand/*.pptx "$SRC"/samples/brand/*.pdf; do [ -e "$f" ] && copy "samples/brand/$(basename "$f")"; done

if [ -z "${SKIP_INSTALL:-}" ]; then
  echo "→ Installing packages and updating the database"
  npm install --no-audit --no-fund --loglevel=error
  npx prisma db push --skip-generate >/dev/null && npx prisma generate >/dev/null
fi

if [ -n "$REMOTE" ]; then
  echo "→ Pushing to $REMOTE"
  git remote add origin "$REMOTE"
  git push -u origin main
fi

cat <<MSG

✓ Done. The app now lives in: $DEST
   Start it with:     cd "$DEST" && npm run dev
$( [ -z "$REMOTE" ] && echo "   Push it later with: cd \"$DEST\" && git remote add origin <repo address> && git push -u origin main" )
   Your old folder is untouched; you can delete it once the new one works.
MSG
