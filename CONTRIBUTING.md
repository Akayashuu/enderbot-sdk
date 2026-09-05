# Contributing

## Setup

```bash
npm install     # npm owns package-lock.json, the lockfile of record
bun install     # works too, its lockfile is gitignored
```

Node 22 or later is required, even when driving the repo with Bun: the type-checker runs on Node.
The version CI pins is in `.nvmrc`.

## Two compilers, on purpose

`tsc7` (TypeScript 7, aliased in `devDependencies`) type-checks `src`, `test` and `examples`.
TypeScript 7 is the native port and ships only `unstable/*` entry points, no classic JavaScript
compiler API, so tsup cannot bundle declarations with it. `typescript` 6 stays installed for that
one job. `ignoreDeprecations` in `tsconfig.json` is what lets the 6 based bundler read a config
already written for 7.

The same split is what the EnderBot monorepo runs.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run lint` | Biome check |
| `npm run format` | Biome check with fixes applied |
| `npm run typecheck` | TypeScript 7 over `src`, `test` and `examples` |
| `npm test` | Vitest on Node, offline only |
| `npm run test:bun` | The same suite, driven by Bun |
| `npm run coverage` | Vitest with v8 coverage and thresholds |
| `npm run test:live` | Vitest including the suites that hit the real API |
| `npm run build` | tsup, ESM and CJS plus declarations |
| `npm run smoke` | Built bundles and binary against a stub wiki, on Node |
| `npm run smoke:bun` | The same, on Bun |
| `npm run check` | Everything CI runs, in one command |
| `npm run check:bun` | The same, driven by Bun |

## Conventions

- No comments in the code. Names carry the meaning; if a block needs a sentence,
  rename or extract instead.
- Classes over loose functions, one subject per file.
- Ports are injected: `fetch`, `CacheStore`, `Clock` and `Sleeper` all have a seam, which is
  what keeps the test suite offline.
- Anything reaching the network in a test belongs in `test/Live.test.ts`, behind
  `ENDERBOT_SDK_LIVE=1`.
- The wiki contract in `src/wiki/contract/` is vendored from the monorepo
  (`web/src/lib/wiki/json/WikiJsonContract.ts`, `shared/src/wiki/dataset/schema.ts`). A DTO change
  upstream has to be copied down here.

## Releasing

1. Bump the version in `package.json` and in `src/Version.ts`. A test fails if the two drift.
2. Move the `Unreleased` entries of `CHANGELOG.md` under the new version.
3. Tag `vX.Y.Z` and push the tag. The release workflow runs the full check and publishes with
   npm provenance.
