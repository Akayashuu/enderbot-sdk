# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

First release.

### Added

- `WikiClient`: typed reads of the EnderBot wiki JSON API, per entity type helpers
  (`item`, `recipe`, `command`, `area`, `drop`, `pet`, `shop`, `npc`, `region`, `concept`,
  `event`), id resolution, and shape guards (`WikiDocuments`).
- `WikiCrawler` and `WikiIndex`: full tree walk with a bounded depth and concurrency,
  lookup by path, id, type or subtree, and a JSON round trip.
- `WikiSearch`: local ranked search over an index, diacritics and separators folded.
- `WikiText`: locale reading with a fallback chain, regional locales broadened.
- `JsonHttpClient`: retries with backoff, `cache-control` aware in memory cache,
  injectable `fetch`, `Sleeper` and `CacheStore`, per request `AbortSignal`.
- `enderbot-wiki` CLI: `get`, `children`, `find`, `list`, `search`, `tree`, `paths`,
  `counts`, `help`, `version`.
- Dual ESM and CommonJS builds, with type declarations for both.
- Node and Bun both supported and both verified: `scripts/runtime-check.mjs` exercises the built
  ESM bundle, the built CommonJS bundle and the built binary against a stub wiki on whichever
  runtime invokes it, and CI runs it on Node 22, 24, 26 and on Bun.

[Unreleased]: https://github.com/Akayashuu/enderbot-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Akayashuu/enderbot-sdk/releases/tag/v0.1.0
