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

# --- optional: create GitHub release (draft or published) ------------------

# Behavior:
#   DRAFT=1   -> create/update a DRAFT release (title is X.Y.Z)
#   PUBLISH=1 -> create/update a PUBLISHED release (title is X.Y.Z)
# If both set, DRAFT wins (remains a draft).

if [[ -n "${GITHUB_TOKEN:-}" && -n "$OWNER_REPO" && ( "${DRAFT:-0}" = "1" || "${PUBLISH:-0}" = "1" ) ]]; then
  API="https://api.github.com"
  UPLOADS="https://uploads.github.com"
  TITLE="${NEW_VER}"              # title without leading 'v'
  DRAFT_FLAG="false"
  [[ "${DRAFT:-0}" = "1" ]] && DRAFT_FLAG="true"

  echo "Creating/updating $( [[ $DRAFT_FLAG = true ]] && echo DRAFT || echo PUBLISHED ) release v${NEW_VER} for ${OWNER_REPO}…"

  # 1) Try to create release
  CREATE_PAYLOAD=$(printf '{"tag_name":"v%s","name":"%s","draft":%s,"prerelease":false}' "$NEW_VER" "$TITLE" "$DRAFT_FLAG")
  CREATE_RESP="$(curl -sS -X POST "${API}/repos/${OWNER_REPO}/releases" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -d "$CREATE_PAYLOAD")"

  REL_ID="$(echo "$CREATE_RESP" | grep -Po '"id"\s*:\s*\K[0-9]+' | head -n1 || true)"

  # 2) If release exists already, fetch by tag and PATCH it
  if [[ -z "$REL_ID" ]]; then
    FETCH_RESP="$(curl -sS -X GET "${API}/repos/${OWNER_REPO}/releases/tags/v${NEW_VER}" \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json")"
    REL_ID="$(echo "$FETCH_RESP" | grep -Po '"id"\s*:\s*\K[0-9]+' | head -n1 || true)"

    if [[ -n "$REL_ID" ]]; then
      PATCH_PAYLOAD=$(printf '{"name":"%s","draft":%s}' "$TITLE" "$DRAFT_FLAG")
      curl -sS -X PATCH "${API}/repos/${OWNER_REPO}/releases/${REL_ID}" \
        -H "Authorization: Bearer ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        -d "$PATCH_PAYLOAD" >/dev/null
    else
      echo "ERROR: Could not create or fetch release for v${NEW_VER}."
      exit 1
    fi
  fi

  # 3) Upload (or re-upload) the asset
  #    If an asset with same name exists, delete then upload.
  ASSETS_JSON="$(curl -sS -X GET "${API}/repos/${OWNER_REPO}/releases/${REL_ID}/assets" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json")"
  EXISTING_ASSET_ID="$(echo "$ASSETS_JSON" | grep -Po "\"name\":\"${ZIP_NAME}\"[^\}]*\"id\":\s*\K[0-9]+" | head -n1 || true)"

  if [[ -n "$EXISTING_ASSET_ID" ]]; then
    curl -sS -X DELETE "${API}/repos/${OWNER_REPO}/releases/assets/${EXISTING_ASSET_ID}" \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" >/dev/null || true
  fi

  echo "Uploading asset ${ZIP_NAME}…"
  curl -sS -X POST "${UPLOADS}/repos/${OWNER_REPO}/releases/${REL_ID}/assets?name=${ZIP_NAME}" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Content-Type: application/zip" \
    --data-binary @"${OUTZIP}" >/dev/null

  if [[ "$DRAFT_FLAG" = "true" ]]; then
    echo "Draft release created/updated: tag v${NEW_VER}, title ${TITLE}."
    echo "NOTE: The download URL in module.json will not be publicly accessible until you publish the release."
  else
    echo "Published release created/updated: v${NEW_VER}."
  fi
else
  if [[ "${DRAFT:-0}" = "1" || "${PUBLISH:-0}" = "1" ]]; then
    echo "Skipping GitHub release: ensure OWNER/REPO is GitHub and GITHUB_TOKEN is set."
  else
    echo "Skipping GitHub release (set DRAFT=1 or PUBLISH=1 to enable)."
  fi
fi

echo "OK: v${NEW_VER} built as ${ZIP_NAME}"