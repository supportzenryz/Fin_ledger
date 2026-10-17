import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is rendered per request (private data), so no incremental cache / R2 bucket is needed.
export default defineCloudflareConfig({});
