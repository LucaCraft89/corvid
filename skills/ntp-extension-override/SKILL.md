---
name: ntp-extension-override
description: Support extensions that replace the new tab page (chrome_url_overrides.newtab) inside Corvid's custom new tab system on all platforms.
---

# ntp-extension-override

## Behavior
- Corvid ships its own `corvid://newtab`. If an enabled extension declares `chrome_url_overrides.newtab`, Corvid loads the extension page for new tabs instead, with zero flash of the default page.
- If multiple extensions claim it, use the most recently enabled one and show a persistent, dismissible control in settings to pick which one wins (and "Corvid default").
- Always provide a way to return to the default (settings page, and an in-page escape: `corvid://newtab?default`).

## Steps
1. Find where the new tab URL is resolved (search for the NTP URL handling and `chrome_url_overrides` in `chrome/browser/extensions/` and `chrome/browser/ui/`). Hook there with the smallest patch; keep Corvid's NTP as the fallback.
2. Make sure the override works for MV2 and MV3 extensions and in new windows, new tabs, and the "home page = new tab" setting.
3. Omnibox focus behavior: the extension page should not steal focus from the address bar on new tab unless the extension asks and the user allows it.
4. Incognito: honor the extension's incognito mode setting; otherwise show the Corvid default.
5. Android: new tab is opened from the tab switcher; verify override and fallback with touch navigation.

## Done when
- A test extension overriding new tab works on all current platforms, picker works with two extensions, fallback works, and disabling the extension restores the default instantly.
