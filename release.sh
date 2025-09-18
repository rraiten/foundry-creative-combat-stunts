#!/usr/bin/env bash
set -euo pipefail

MODULE_JSON="module.json"
PUBLISH="${PUBLISH:-0}"       # 1 = create GitHub release; 0 = just build/tag
VERSION_ARG="${1:-${VERSION:-}}"

# --- helpers ---------------------------------------------------------------

get_json_field() { # $1=key
  grep -Po "\"$1\"\\s*:\\s*\"\\K[^\"]+" "$MODULE_JSON" || true
}

bump_patch() { # x.y.z -> x.y.(z+1)
  IFS='.' read -r MAJ MIN PAT <<<"$1"
  PAT=$((PAT + 1))
  echo "${MAJ}.${MIN}.${PAT}"
}

get_owner_repo() {
  local url
  url="$(git config --get remote.origin.url || true)"
  url="${url%.git}"
  if [[ "$url" =~ github.com[:/]+([^/]+)/([^/]+)$ ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  else
    echo ""
  fi
}

# Safely replace JSON fields in-place (no jq); keeps formatting simple
# $1 = version  $2 = download (optional; if empty we won't touch download)
replace_version_and_download() {
  local version="$1" download="$2" tmp
  tmp="$(mktemp)"

  if [[ -n "$download" ]]; then
    sed -E \
      -e "s/\"version\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"version\": \"${version//\//\\/}\"/" \
      -e "s/\"download\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"download\": \"${download//\//\\/}\"/" \
      "$MODULE_JSON" > "$tmp"
  else
    sed -E \
      -e "s/\"version\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"version\": \"${version//\//\\/}\"/" \
      "$MODULE_JSON" > "$tmp"
  fi

  mv "$tmp" "$MODULE_JSON"
}


# --- validations -----------------------------------------------------------

[[ -f "$MODULE_JSON" ]] || { echo "ERROR: $MODULE_JSON not found."; exit 1; }

CURR_VER="$(get_json_field version)"
[[ -n "$CURR_VER" ]] || { echo "ERROR: Could not read version from $MODULE_JSON."; exit 1; }

OWNER_REPO="$(get_owner_repo)"
if [[ -z "$OWNER_REPO" ]]; then
  echo "WARNING: Could not infer GitHub owner/repo from origin. Download URL will not be updated."
fi

# --- compute new version & names ------------------------------------------

NEW_VER="${VERSION_ARG:-$(bump_patch "$CURR_VER")}"
REPO_NAME="${OWNER_REPO##*/}"
MOD_ID="$(get_json_field id)"

# zip name convention: prefer repo name to match Releases URL
ZIP_NAME="${REPO_NAME:-${MOD_ID}}-v${NEW_VER}.zip"
DOWNLOAD_URL=""
if [[ -n "$OWNER_REPO" ]]; then
  DOWNLOAD_URL="https://github.com/${OWNER_REPO}/releases/download/v${NEW_VER}/${ZIP_NAME}"
else
  DOWNLOAD_URL="$(get_json_field download)"  # leave as-is if unknown
fi

echo "Current version : ${CURR_VER}"
echo "New version     : ${NEW_VER}"
echo "Zip name        : ${ZIP_NAME}"
[[ -n "$DOWNLOAD_URL" ]] && echo "Download URL    : ${DOWNLOAD_URL}"

# --- update module.json ----------------------------------------------------

replace_version_and_download "$NEW_VER" "$DOWNLOAD_URL"

# --- build zip using git archive (honors .gitattributes export-ignore) ----

git ls-files >/dev/null 2>&1 || { echo "ERROR: not a git repo?"; exit 1; }

# ensure working tree is clean enough for a reproducible archive
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "NOTE: You have uncommitted changes. They will NOT be in the zip (git archive uses HEAD)."
fi

OUTDIR="$(dirname "$PWD")"
OUTZIP="$OUTDIR/$ZIP_NAME"

git archive --format=zip -o "$OUTDIR/$ZIP_NAME" HEAD

echo "Zip created at: $OUTZIP"

# --- commit + tag + push ---------------------------------------------------

git add "$MODULE_JSON"
git commit -m "Release v${NEW_VER}" || echo "(Nothing to commit)"
git tag -a "v${NEW_VER}" -m "v${NEW_VER}" || echo "(Tag already exists?)"
git push || true
git push --tags || true

# --- optional: create GitHub release --------------------------------------

if [[ "$PUBLISH" = "1" ]]; then
  : "${GITHUB_TOKEN:?GITHUB_TOKEN required for release}"
  [[ -n "$OWNER_REPO" ]] || { echo "ERROR: OWNER/REPO unknown; cannot publish release."; exit 1; }

  echo "Creating GitHub release v${NEW_VER} for ${OWNER_REPO}…"
  API="https://api.github.com"
  UPLOADS="https://uploads.github.com"

  # If the release already exists, GitHub returns 422. We’ll try GET then POST asset.
  # 1) Create (or retrieve) release
  create_resp="$(curl -sS -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -X POST "${API}/repos/${OWNER_REPO}/releases" \
    -d "$(printf '{"tag_name":"v%s","name":"v%s","draft":false,"prerelease":false}' "$NEW_VER" "$NEW_VER")" )"

  rel_id="$(echo "$create_resp" | grep -Po '"id"\s*:\s*\K[0-9]+' | head -n1 || true)"
  if [[ -z "$rel_id" ]]; then
    # maybe it already exists — fetch by tag
    echo "Release may exist already; trying fetch…"
    fetch_resp="$(curl -sS -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "${API}/repos/${OWNER_REPO}/releases/tags/v${NEW_VER}")"
    rel_id="$(echo "$fetch_resp" | grep -Po '"id"\s*:\s*\K[0-9]+' | head -n1 || true)"
  fi

  [[ -n "$rel_id" ]] || { echo "ERROR: Could not obtain release id."; exit 1; }

  # 2) Upload asset (may fail if an asset with same name exists; then replace)
  echo "Uploading asset ${ZIP_NAME}…"
  up_status="$(curl -sS -w "%{http_code}" -o /dev/null \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Content-Type: application/zip" \
    --data-binary @"${ZIP_NAME}" \
    "${UPLOADS}/repos/${OWNER_REPO}/releases/${rel_id}/assets?name=${ZIP_NAME}")"

  if [[ "$up_status" != "201" ]]; then
    echo "Upload returned ${up_status}. Trying to delete existing asset with same name and re-upload…"
    assets="$(curl -sS -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "${API}/repos/${OWNER_REPO}/releases/${rel_id}/assets")"
    asset_id="$(echo "$assets" | grep -Po "\"name\":\"${ZIP_NAME}\"[^\}]*\"id\":\s*\K[0-9]+" | head -n1 || true)"
    if [[ -n "$asset_id" ]]; then
      curl -sS -X DELETE -H "Authorization: Bearer ${GITHUB_TOKEN}" \
        "${API}/repos/${OWNER_REPO}/releases/assets/${asset_id}" >/dev/null || true
      curl -sS -H "Authorization: Bearer ${GITHUB_TOKEN}" \
        -H "Content-Type: application/zip" \
        --data-binary @"${ZIP_NAME}" \
        "${UPLOADS}/repos/${OWNER_REPO}/releases/${rel_id}/assets?name=${ZIP_NAME}" >/dev/null
    fi
  fi

  echo "Release published: v${NEW_VER}"
else
  echo "Skipping GitHub release (PUBLISH=1 to enable)."
fi

echo "OK: v${NEW_VER} built as ${ZIP_NAME}"