# Privacy

Botprint is local-first diagnostic tooling.

Botprint does not upload profile data, reports, compare artifacts, auth headers, or browser metadata. Artifacts stay on disk unless you choose to share them.

## What Profiles Contain

Botprint profiles can contain browser-environment data, including:

- user agent
- platform
- languages
- timezone
- viewport and screen metrics
- device scale factor
- hardware concurrency
- device memory
- plugin and MIME type counts
- WebGL vendor and renderer
- unmasked WebGL vendor and renderer when available
- canvas sample status and hash
- cookie, localStorage, sessionStorage, IndexedDB, and service worker availability
- selected Permissions API states
- WebRTC API availability and host-candidate gathering presence
- CDP browser product and protocol version
- profile label, target URL, and probe context

Existing-target profiles may also include:

- CDP target ID
- target type
- a `page-contamination-possible` probe warning

These fields are useful for diagnostics, but they can reveal details about a browser environment. Review artifacts before sharing them publicly.

## Fresh Diagnostic Page

By default, Botprint creates a fresh local diagnostic page and runs the probe there. The diagnostic page is static HTML.

The diagnostic server binds to `127.0.0.1` by default.

For Docker or cross-namespace browser setups, users may explicitly choose:

```bash
--diagnostic-bind 0.0.0.0
--diagnostic-host host.docker.internal
```

Only use broader binding when the browser cannot reach the default localhost page.

## Existing Target Mode

Existing-target mode runs the probe inside an already-open CDP page target.

This is useful when you need to measure a specific page or framework context, but it is less isolated than the default fresh diagnostic page. Existing-target output may reflect:

- page scripts
- framework state
- service workers
- content security policy
- cookies
- storage state
- application state
- extensions or browser policy affecting that page

The probe performs short-lived browser API checks. It attempts to clean up storage keys it creates, but a page crash, timeout, or browser-level interruption could leave small local artifacts such as a temporary storage key or IndexedDB database name.

Do not run existing-target probes on sensitive logged-in pages unless you are comfortable with the page observing normal in-page JavaScript execution.

## Auth Headers

`--auth-header` values are used only for the CDP connection path.

Botprint does not persist auth-header values in profile artifacts.

If you quote commands in issues, pull requests, or agent prompts, redact header values:

```bash
--auth-header "Authorization: Bearer <redacted>"
```

## Sharing Checklist

Before sharing a profile or report publicly:

- confirm it does not include sensitive labels or target URLs
- review timezone and locale information
- review screen, hardware, and WebGL details
- avoid sharing auth headers or shell history
- prefer synthetic examples from `examples/synthetic` for public docs and tests

## No Telemetry

Botprint has no telemetry pipeline. It does not phone home.
