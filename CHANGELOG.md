# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.0.0](https://github.com/knackstedt/shokupan/compare/v1.0.0-beta.2...v1.0.0) (2026-05-29)


### Features

* add oxlint lint step to CI ([26e1b0c](https://github.com/knackstedt/shokupan/commit/26e1b0c75e28c703945ed5a0ca579c40188154a5))
* make release depend on tests ([ae5aa53](https://github.com/knackstedt/shokupan/commit/ae5aa5355e29d512afcfa7d54069b4d5d09a2a7a))


### Bug Fixes

* add security hardening for cookie domains, redirects, SSRF, and path traversal ([74d5e9f](https://github.com/knackstedt/shokupan/commit/74d5e9f089641ef648841cc3eda909553247c769))
* client build ([1071a1d](https://github.com/knackstedt/shokupan/commit/1071a1da2d6378bd0f41fc477b8c99fc5cf4966a))
* client test failing ([e1dda72](https://github.com/knackstedt/shokupan/commit/e1dda72a74602d8ccaaa0f359f706b7c821b521f))
* mock window.location ([bb74a66](https://github.com/knackstedt/shokupan/commit/bb74a6678a882644f90c358da1cd6b00f8b959ec))

## [1.0.0-beta.2](https://github.com/knackstedt/shokupan/compare/v1.0.0-beta.1...v1.0.0-beta.2) (2026-05-28)


### Features

* update docs prepping for v1.0 release ([739721e](https://github.com/knackstedt/shokupan/commit/739721e929e25022181f8c794c7ea3ec837322de))


### Bug Fixes

* **types:** improve type safety and remove type assertions across codebase ([8bcdea6](https://github.com/knackstedt/shokupan/commit/8bcdea65290c245132b901f5ce69a9aa90920250))

## [1.0.0-beta.1] - 2026-05-18

### Fixed

- **Path-based middleware** — `app.use('/path', middleware)` now works like Express, running middleware only for matching routes.
- **Middleware validation** — `app.use()` now throws a clear `TypeError` when a non-function is passed, instead of a cryptic runtime crash.
- **MiddlewareTracker guard** — Added early validation in `MiddlewareTracker.wrap()` to reject non-functions with a helpful message.

### Changed

- **Sample 5** — Fixed import of `validate` and corrected middleware usage patterns.

---

## [1.0.0-beta.0] - 2026-05-18

### Added

- **Vite Plugin Integration** — Full-stack Vite dev server integration with hot reload and SPA fallback support.
- **Permission System** — Granular RBAC with wildcard support, role inheritance, and per-resource action control.
- **WebSocket Router Nesting** — Nested `ShokupanWebsocketRouter` instances with event namespacing.
- **HTTP Bridge** — Internal sub-request API for making HTTP calls within the app without network overhead.
- **Security Controls** — Request replay protection, sensitive header redaction, and hardened `ctx.file` options.
- **Smart Auto-Caching** — Configurable in-memory cache with max memory limit and automatic eviction.
- **Global State Augmentation** — `GlobalShokupanState` interface for module-augmenting app-level state types.
- **TypeBox Compiler Support** — Native TypeBox compiled schema validation alongside existing validators.
- **CLI Enhancements** — Improved `shokupan dev` command with better error reporting and diagnostics.
- **Dashboard Improvements**
  - New REST API explorer with request replay and copy-to-curl
  - WebSocket API explorer with SEND event support
  - Network tools with URL highlighting and xyflow diagrams
  - Permission matrix viewer
  - Caller tab with stack trace hyperlinks
  - Timing & middleware merged view
  - Column state persistence in local storage

### Changed

- **Performance** — Disabled AsyncLocalStorage storing entire request context; disabled auto AbortController creation.
- **Validation** — Preserved `ctx.body()` method after body validation so it remains callable downstream.
- **Auth Plugin** — Made `onInit` options optional for smoother DX.
- **Permissions Plugin** — Made `onInit` options optional for smoother DX.
- **AJV** — Applied stricter default AJV configuration for safer parsing.

### Fixed

- Lazy-loaded JSX components to remove hard `preact` dependency in production builds.
- Lazy-loaded `ajv` in OpenAPI validator to avoid hard dependency.
- Gracefully handle missing `preact` in development plugins.
- Exported `ShokupanWebsocketRouter` correctly in public API.
- Fixed error-view static asset resolution.
- Fixed default protocol detection in `ctx.protocol`.
- Fixed CORS permission handling in full example.
- Fixed manual HTML escaping in dashboard by using Angular `DomSanitizer`.
- Fixed constant re-calculations of visible dashboard tabs.
- Improved OpenAPI spec generation failure error messages.
- Corrected middleware tracker `ctx` typing.

### Security

- Added security fixes test suite.
- Restricted releases to deploying only from `main` branch.
- Prevented logging of sensitive headers (`authorization`, `cookie`, `x-api-key`, etc.).
- Added bounds on profile picture dimensions in dashboard.

### Documentation

- Added contributing guidelines (`CONTRIBUTING.md`).
- Added issue templates for bug reports and feature requests.
- Documented design decision to support both functional and decorator routing styles.
- Improved websocket support documentation.
- Adjusted Starlight config for better LLM support (`llms.txt`).

---

## [0.16.7] - 2025-04-12

### Fixed

- Various stability fixes and performance improvements.

---

## [0.16.0] - 2025-03-28

### Added

- OpenTelemetry support with built-in distributed tracing.
- MCP Server plugin for LLM tool exposure.
- Cluster plugin for multi-core utilization.
- AsyncAPI plugin for WebSocket documentation.
- GraphQL Yoga support alongside Apollo Server.
- Socket.IO plugin integration.
- Rate limiting middleware.
- Security headers middleware.
- Idempotency plugin.
- Proxy middleware.
- OpenAPI validator middleware.
- HTMX plugin.
- Web App plugin.
- SurrealDB integration.
- Full dashboard with debug tools and API explorer.
- Scalar OpenAPI documentation.
- Comprehensive validation support (Zod, Ajv, TypeBox, Valibot, class-validator).
- OAuth2 authentication (GitHub, Google, Microsoft, Apple, Auth0, Okta).
- Dependency injection container.
- Decorator-based controllers.
- Express middleware compatibility.
- Local HTTPS with auto-generated certificates.
