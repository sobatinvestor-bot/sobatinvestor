// Cloudflare Pages Function: /api/chat
// Proxies requests to Anthropic API while keeping the API key server-side.
// Set ANTHROPIC_API_KEY as an environment variable in Cloudflare Pages settings.

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured in Cloudflare Pages environment' }, 500);
    }

    const body = await request.json();

    // Validation - only allow expected fields
    const safeBody = {
      model: body.model || 'claude-sonnet-4-20250514',
      max_tokens: Math.min(body.max_tokens || 1000, 2000),
      system: body.system,
      messages: body.messages,
    };

    if (!Array.isArray(safeBody.messages) || safeBody.messages.length === 0) {
      return jsonResponse({ error: 'messages array required' }, 400);
    }

    // Rate limiting check (basic) - count user messages
    const userMessages = safeBody.messages.filter(m => m.role === 'user').length;
    if (userMessages > 50) {
      return jsonResponse({ error: 'Conversation too long' }, 400);
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(safeBody),
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (err) {
    console.error('API error:', err);
    return jsonResponse({ error: 'Internal server error', detail: err.message }, 500);
  }
}

// Handle CORS preflight (just in case)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
