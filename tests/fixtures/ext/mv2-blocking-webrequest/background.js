// Blocks any request whose URL contains /mv2-blocked/ and counts blocks (persistent background page).
let blocked = 0;
chrome.webRequest.onBeforeRequest.addListener(
  () => { blocked++; chrome.storage.local.set({ mv2Blocked: blocked }); return { cancel: true }; },
  { urls: ['*://*/*mv2-blocked*'] },
  ['blocking']
);
