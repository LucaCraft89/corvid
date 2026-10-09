import '../src/sync-page.js';
import {SyncError} from '../src/proxy.js';
(window as unknown as {__SyncError: typeof SyncError}).__SyncError = SyncError;
