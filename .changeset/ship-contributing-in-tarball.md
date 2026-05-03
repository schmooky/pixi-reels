---
'pixi-reels': patch
---

Fix: ship `CONTRIBUTING.md` in the npm tarball so the npmjs.com "Contributing" sidebar link resolves. npmjs builds that link from `repository.directory` (`packages/pixi-reels`) and a standard filename, but the file previously only existed at the monorepo root — the link 404'd. The build script now syncs `CONTRIBUTING.md` into the package alongside `README.md` and `LICENSE`, and the package's `files` array includes it.
