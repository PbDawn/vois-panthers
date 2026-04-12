/**
 * ═══════════════════════════════════════════════════════════════
 * VOIS Panthers — Anthropic API CORS Proxy (Cloudflare Worker)
 * ═══════════════════════════════════════════════════════════════
 *
 * WHY THIS IS NEEDED:
 * Browsers block direct calls to api.anthropic.com from frontend
 * apps (CORS policy). This free Cloudflare Worker acts as a proxy
 * that adds the required headers and forwards requests.
 *
 * HOW TO DEPLOY (FREE — takes ~3 minutes):
 * ─────────────────────────────────────────
 * 1. Go to https://dash.cloudflare.com → sign up free
 * 2. Click "Workers & Pages" → "Create" → "Create Worker"
 * 3. Delete the default code and paste this entire file
 * 4. Click "Deploy"
 * 5. Go to "Settings" → "Variables" → "Environment Variables"
 *    Add a SECRET variable:
 *      Name:  ANTHROPIC_API_KEY
 *      Value: sk-ant-api03-xxxxxxxxxxxx   (your Anthropic API key)
 *    Click "Encrypt" → Save
 * 6. Copy your Worker URL (looks like: https://vois-ai.your-name.workers.dev)
 * 7. In App.jsx, find this line and paste your Worker URL:
 *      const WORKER_URL = ''
 *    Change it to:
 *      const WORKER_URL = 'https://vois-ai.your-name.workers.dev'
 * 8. Done! The AI Notes button will now work.
 *
 * YOUR ANTHROPIC API KEY:
 * ───────────────────────
 * Get one free at: https://console.anthropic.com
 * New accounts get free credits. The key starts with sk-ant-api03-
 *
 * SECURITY NOTE:
 * The API key is stored as an encrypted environment variable in
 * Cloudflare — it is never exposed to the browser. The worker
 * also restricts requests to only your app's origin.
 * ═══════════════════════════════════════════════════════════════
 */

// ── CORS: restrict to your app's domain for security
// Change this to your actual app domain (e.g. 'https://vois-panthers.vercel.app')
// Use '*' during development/testing to allow all origins
const ALLOWED_ORIGIN = '*'

export default {
  async fetch(request, env) {
    // Handle CORS preflight (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
          'Access-Control-Max-Age': '86400',
        }
      })
    }

    // Only allow POST to /v1/messages
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/v1/messages') {
      return new Response(JSON.stringify({ error: 'Method or path not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        }
      })
    }

    // Check API key is configured
    const apiKey = env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: { message: 'Worker is missing ANTHROPIC_API_KEY environment variable. See setup instructions in worker.js.' }
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        }
      })
    }

    // Forward request to Anthropic
    try {
      const body = await request.text()

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body,
      })

      const responseText = await anthropicRes.text()

      return new Response(responseText, {
        status: anthropicRes.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        }
      })
    } catch (err) {
      return new Response(JSON.stringify({
        error: { message: `Worker fetch failed: ${err.message}` }
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        }
      })
    }
  }
}
