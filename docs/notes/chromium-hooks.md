# Chromium hook points: TO VERIFY on the pinned tree

No Chromium checkout was available while writing Phase 2. Every name below is from memory and must be confirmed with one targeted grep, then this file updated with the confirmed path/signature.

| Need | Believed hook | Verify with |
|---|---|---|
| Renderer unresponsive/responsive | `content::WebContentsObserver::OnRendererUnresponsive/OnRendererResponsive` | grep OnRendererUnresponsive content/public/browser |
| Renderer crash | `WebContentsObserver::PrimaryMainFrameRenderProcessGone` | same file |
| Console messages | `WebContentsObserver::OnDidAddMessageToConsole` (signature has changed across milestones) | same file |
| Net events | `net::NetLog::ThreadSafeObserver`, capture mode kDefault | net/log/net_log.h |
| Error page data | `LocalizedError` / `NetErrorHelper` pipeline | grep LocalizedError::GetStrings |
| FIDO discovery | `device::FidoDiscoveryFactory::Create` | device/fido/fido_discovery_factory.h |
| Enclave authenticator gate | `device::enclave` / `webauthn` features in `device/fido/features.cc` | grep -i enclave |
| Main-thread stack of a hung renderer | not available from the browser process without a sampling profiler; options: crashpad dump of the hung process (`crashpad_client` dump without crash), or `base::StackSamplingProfiler` in the renderer via an IPC that the hung main thread cannot service. Likely requires the dump-without-crashing route, then local symbolization. | OPEN DESIGN RISK: acceptance test 1 depends on it |
| Dev-only `corvid://hang-test` | new WebUI under src-overlay, blocking script in renderer | n/a |
| `chrome://crash` style trigger used by test 3 | confirm still exists; else use `chrome://inducebrowsercrashforrealz`-style renderer crash (`chrome://crash`) | grep kChromeUICrashURL |
