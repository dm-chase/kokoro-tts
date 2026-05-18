# Publishing Kokoro TTS

How to ship this project so the `brew tap dm-chase/kokoro-tts` and `brew install kokoro-tts-server` commands in the README actually resolve.

## One-time setup

You need **two GitHub repos**:

1. **`dm-chase/kokoro-tts`** — this repo (the source). Push it public.
2. **`dm-chase/homebrew-kokoro-tts`** — the Homebrew tap repo. Naming is strict: it MUST be `homebrew-<tapname>` for `brew tap dm-chase/<tapname>` to find it.

Why two repos: Homebrew taps are special-purpose repos that contain `Formula/*.rb` files. They're separate from the source so `brew tap` can be a lightweight clone.

## Step 1 — Push this repo to GitHub

```bash
cd /path/to/your/local/clone/kokoro-tts

# Initialize git if needed
git init
git add .
git commit -m "feat: initial Kokoro TTS server + Raycast extension"

# Create the GitHub repo (public)
gh repo create dm-chase/kokoro-tts --public --source=. --push
```

## Step 2 — Tag a release

```bash
# Tag and push v0.1.0
git tag v0.1.0
git push origin v0.1.0

# Compute the SHA256 of the release tarball — this is the value
# that goes into the formula's `sha256` field.
curl -sSL https://github.com/dm-chase/kokoro-tts/archive/refs/tags/v0.1.0.tar.gz \
  | shasum -a 256
```

Copy the hex string (first 64 chars) into `Formula/kokoro-tts-server.rb`, replacing the all-zeros placeholder.

```ruby
sha256 "<paste your 64-char sha here>"
```

Commit that change to this repo too — the formula should track release tags 1:1.

## Step 3 — Create the tap repo

```bash
# Create the tap repo with the strict naming
gh repo create dm-chase/homebrew-kokoro-tts --public --description "Homebrew tap for kokoro-tts"

# Clone it locally, copy the formula in
cd /tmp
gh repo clone dm-chase/homebrew-kokoro-tts
cd homebrew-kokoro-tts
mkdir -p Formula
cp /path/to/your/clone/kokoro-tts/Formula/kokoro-tts-server.rb Formula/

# Tap repos need a README so users see something when they land on it
cat > README.md <<'EOF'
# homebrew-kokoro-tts

Homebrew tap for the Kokoro TTS local server.

## Install

```bash
brew tap dm-chase/kokoro-tts
brew install kokoro-tts-server
brew services start kokoro-tts-server
```

See [dm-chase/kokoro-tts](https://github.com/dm-chase/kokoro-tts) for the source and the matching Raycast extension.
EOF

git add .
git commit -m "feat: kokoro-tts-server formula v0.1.0"
git push origin main
```

## Step 4 — Test the install

From any machine (or your own, after uninstalling the manual setup):

```bash
brew tap dm-chase/kokoro-tts
brew install kokoro-tts-server
brew services start kokoro-tts-server

# Verify
curl http://127.0.0.1:8123/health
# → {"status":"loading"} for ~30s while model downloads, then {"status":"ok"}
```

## Updating the formula for future releases

Each new release of `kokoro-tts` (semver bump):

1. Push the source repo with new commits
2. `git tag v0.X.Y && git push origin v0.X.Y`
3. Compute new SHA: `curl -sSL https://github.com/dm-chase/kokoro-tts/archive/refs/tags/v0.X.Y.tar.gz | shasum -a 256`
4. In `homebrew-kokoro-tts/Formula/kokoro-tts-server.rb`, bump `url` to the new tag and replace `sha256`
5. Commit + push the tap repo
6. Users get the update on their next `brew upgrade`

## Common gotchas

- **Tap repo name MUST be `homebrew-X`.** `dm-chase/kokoro-tts-tap` won't be found by `brew tap dm-chase/kokoro-tts`.
- **Formula filename = formula class name in snake_case.** `kokoro_tts_server.rb` would not match `class KokoroTtsServer`. Use `kokoro-tts-server.rb`.
- **`sha256 "00...00"` won't actually install.** It's only there so `brew style` accepts the formula in this repo. The tap repo's copy must have the real SHA.
- **`brew install` from a private tap repo requires the user to have read access.** Keep the tap repo public unless you're scoping to known users.
- **HEAD installs** (`brew install --HEAD`) work without a SHA — useful for testing before tagging. They install from `main` of the source repo.

## Raycast extension publishing (separate flow)

The `raycast-extension/` directory is published to the Raycast Store independently. See its own README. The brew formula and the Raycast Store submission are two independent publishing flows — power users get both, casual users get just the extension (default `say` backend).
