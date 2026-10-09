---
name: add-webui-page
description: Add a custom internal page (settings, new tab, extensions, history, downloads, error/crash/freeze/SSL/offline) as a Corvid WebUI page and hide the stock Chromium equivalent.
---

# add-webui-page

## Layout
- Source: `ui/pages/<page>/` (TypeScript, Lit/web components, shared design tokens from `theme/`).
- C++ glue (overlay): `src-overlay/corvid/webui/<page>/` containing the `WebUIController`, data source, and Mojo handler.
- Mojo interface: `src-overlay/corvid/webui/<page>/<page>.mojom`.
- URL scheme: `corvid://<page>`. Register in the WebUI config registry; keep `chrome://` aliases redirecting to the Corvid page.

## Steps
1. Define the Mojo interface for data and actions the page needs. Keep the surface small.
2. Write the page UI. All strings through the i18n catalog (rule 7). Use theme tokens only; no hard-coded colors.
3. Register the controller and URL. Add GN targets in the overlay; add a minimal hook patch only if registration requires editing an upstream file (use `add-patch`).
4. Redirect or block the stock page: add it to `docs/stock-pages.md` (status: replaced/blocked/redirected) and test that the URL no longer renders stock UI.
5. Accessibility: keyboard navigation, focus order, ARIA labels, contrast in light/dark/high-contrast.
6. Add a browser test that loads the page and asserts key elements; add a screenshot test for light/dark.

## Error-type pages
Error pages must show: plain-language summary first, then expandable technical detail (DNS result, resolver, TLS chain/errors, timings, retry log, error code). Use `diagnostics-event` data once Phase 2 lands; before that show what the net stack provides.

## Done when
- Page loads, themes live, passes a11y check, stock equivalent is unreachable, entry updated in `docs/stock-pages.md`.
