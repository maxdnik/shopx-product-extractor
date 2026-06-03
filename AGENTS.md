# AGENTS.md

Guidance for AI agents working in this repository.

## Project overview

**ShopX Product Extractor** is described in `README.md` as a universal ecommerce product extraction engine. As of the initial repository state, the codebase contains only documentation—no application source, dependency manifests, tests, or service definitions.

## Cursor Cloud specific instructions

### Repository state

- Tracked files are minimal (`README.md` only until implementation lands).
- There is no `package.json`, `pyproject.toml`, `docker-compose.yml`, Makefile, or CI configuration yet.
- No lint, test, or dev-server scripts exist in-repo; do not invent commands until manifests and scripts are added.

### Services

| Service | Required? | Notes |
|---------|-------------|--------|
| *(none)* | — | Nothing to start for local dev or E2E today |

When the product is implemented, document required vs optional processes here (API, worker, browser automation, queue, etc.) based on whatever orchestration the repo adds.

### Toolchain on Cloud Agent VMs

The VM image typically includes:

- **Node.js** (via nvm, v22.x) with `npm`, `pnpm`, and `yarn`
- **Python 3.12** with `pip`
- **Git**

Choose the package manager and runtime that match future lockfiles in this repo (`package-lock.json` → npm, `pnpm-lock.yaml` → pnpm, etc.).

### Standard commands (when code exists)

Until dependency files and scripts are committed, skip install/lint/test/dev steps. After they exist, prefer documented scripts in `package.json`, `Makefile`, or `README.md` rather than ad-hoc commands.

### Gotchas

- Pushing implementation without `AGENTS.md` updates will leave cloud agents without runbook context—keep this file in sync when adding services or non-obvious startup steps.
- Do not assume Docker or external APIs are configured unless `.env.example` or compose files document them.
