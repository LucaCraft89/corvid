chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set({ mv3Installed: true }));
