# M5 WebUI chrome shell: research note and options (2026-10-13)

Status: RESEARCH DRAFT written without a Chromium checkout. Every Chromium path or symbol below is from memory of recent Chromium and UNVERIFIED; section 5 lists the greps to run on the pinned tree (155.0.8059.39). No code is to be written until Luca picks an approach (plan: ask before committing to a large approach). Repo side already exists: `ui/chrome/{shell,components,bridge,omnibox}.ts`, `ui/layout/*`, `docs/notes/{default-layout,addressbar-position}.md`, `patches/ui/0210` (intent only).

## 1. Goal (from the plan)
Tab strip, toolbar, address bar, side panel host in a native window; default layout `desktop-vertical-tabs`; presets; address bar movable top/bottom; edit mode with drag and drop; layouts saved as JSON; Reset layout always reachable; required components cannot be removed. Acceptance 03 (layout) and 04 (modules) must pass on the real shell. Fallback explicitly allowed: ship 0.1 without custom chrome. Luca chose that for Thursday; M5 follows.

## 2. What Chromium likely already offers (UNVERIFIED)
- A WebUI tab strip (`chrome/browser/ui/webui/tab_strip`, used for touch/ChromeOS tablet mode and the `webui-tab-strip` feature): a WebUI page hosted in a views `WebView` inside `TabStripRegionView`-adjacent code. Proves a Views-hosted WebUI for tabs is feasible; it is touch-first and assumes the Views toolbar remains.
- Side panel (`chrome/browser/ui/views/side_panel`): Views-hosted container with WebUI entries (reading list, bookmarks, history clusters). Reusable as the side-panel host.
- WebUI toolbar experiments ("WebUI Toolbar", `chrome/browser/ui/webui/...` for the omnibox popup, `omnibox_popup`): the omnibox popup is already a WebUI in recent versions; the address bar text field itself stays a Views `Textfield`.
- Views-hosted WebUI plumbing: `WebUIController`, `MojoWebUIController`, `views::WebView`, `BubbleWebUIDialog`.
- Browser window composition: `BrowserView` + `BrowserViewLayout`, `TopContainerView`, `TabStrip`, `ToolbarView`, `LocationBarView`. The Views toolbar and tab strip are deeply wired to `Browser`, `TabStripModel`, omnibox edit model, extension toolbar actions, and focus traversal.

## 3. Approaches
| # | Approach | What it means | Effort | Risk | Rebase cost |
|---|---|---|---|---|---|
| A | Hybrid: keep Views tab strip/toolbar, add Corvid WebUI as side panels and pages, theme + rearrange limited (position of address bar, vertical tabs via existing Chromium vertical tabs if present) | Smallest. Layout engine only drives what Chromium already lets move | Low to medium | Low | Low |
| B | WebUI chrome inside the existing `BrowserView`: hide `TabStrip`/`ToolbarView`, insert one `views::WebView` hosting `corvid://chrome-shell` above/beside the content area; shell page drives tabs through Mojo from `TabStripModel`; address bar is a WebUI input that talks to the omnibox backend (`AutocompleteController`) | The intent patch 0210 as written ("delegate swap", `CorvidBrowserView` subclass in overlay, small factory hook) | High | High: omnibox, focus, drag of tabs between windows, accessibility, IME, extension toolbar icons and popups all need reimplementation | Medium to high (touches `BrowserView` layout) |
| C | Fully custom native shell window (own top-level window, `content::WebContents` parented in a custom view; reuse `Browser` minimally) | Maximum freedom | Very high | Very high: loses most of `Browser` UI integration | High |

Recommendation: B, staged, with A as the milestone-0 safety net. Stage 1: ship side panel host + settings/edit pages on Views chrome (A). Stage 2: hide the Views tab strip and render tabs in WebUI (reuse `webui/tab_strip` mojom if it exists on the pinned tree). Stage 3: WebUI toolbar with the Views omnibox kept as an embedded native view the shell positions through a slot rect (a "native slot" in the layout engine), so the hardest widget (location bar: IME, autocomplete popup, security chip, drag-and-drop of the URL) is not rewritten at first. This keeps required components working while everything else becomes movable. The cost: the address bar can move but not be fully WebUI-styled until later.

## 4. Open questions for Luca (decide before code)
1. Accept staged B (native address bar slot first), or require a fully WebUI address bar from the first shell release?
2. Is a cut to A (limited rearrangement) acceptable for 0.1 if B stage 2 slips?
3. Vertical tabs: use Chromium's own vertical tab strip if the pinned tree has it, or WebUI tabs only?

## 5. Verification greps to run on the pinned tree (record results in this file)
- `rg -l "tab_strip" chrome/browser/ui/webui | head` and `rg "WebUITabStrip|kWebUITabStrip"` in `chrome/browser/ui`: does the WebUI tab strip still exist; its mojom (`tab_strip.mojom`).
- `rg "class BrowserViewLayout|class BrowserView\b" chrome/browser/ui/views/frame`: layout hooks; is there already a vertical-tabs layout (`vertical_tab_strip`, `kVerticalTabs`)?
- `rg "SidePanelCoordinator|SidePanelRegistry|SidePanelEntry"`: side panel host API for registering a Corvid panel.
- `rg "OmniboxPopupWebUI|omnibox_popup" chrome/browser/ui/webui` and `LocationBarView` constructors: how coupled the text field is.
- `rg "ExtensionsToolbarContainer|ExtensionsMenu"`: extension icons/popups, needed for G3 UX in the shell.
- `rg "TabStripModel" --files-with-matches chrome/browser/ui/webui | head`: how WebUI talks to tab state.
- `gn args --list` for `enable_webui_tab_strip`/similar flags.
- Confirm `corvid://chrome-shell` exists in `src-overlay/corvid/chrome_shell` and which Mojo interface `ui/chrome/bridge.ts` expects.

## 6. Test plan for M5 (acceptance)
03-layout and 04-modules run on the real shell; Reset layout reachable from a keyboard-only path; required components not removable (unit tests in `ui/layout/layout.test.ts` already model this); focus traversal and IME smoke on X11 and Wayland (SKIPPED if not run).

## 7. Dependencies
After M4 is green; needs `docs/DESIGN.md` approved; needs G3 (extension toolbar). Estimate (unmeasured): research on tree 0.5 day, stage 1 about 2 days, stage 2 about 3 to 5 days, stage 3 about 1 week, each with 2 to 4 full builds.
