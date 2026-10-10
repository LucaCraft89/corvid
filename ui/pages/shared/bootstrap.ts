// Imported first by every packaged page entry (ui/tools/bundle.mjs): installs the page data API.
import { setPageApi } from './api.ts';
import { stubApi } from './stub-api.ts';

setPageApi(stubApi);
