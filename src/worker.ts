// Cloudflare Workers Entry Point
// This file is the entry point for Cloudflare Workers deployment

import { createApp } from './core/app'

// Create the Hono app
const app = createApp()

// Export for Cloudflare Workers runtime
export default app
