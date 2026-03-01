import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env');
  process.exit(1);
}

app.use(express.json({ limit: '500kb' }));
app.use(express.static('.'));

// --- Rate limiter ---

const requestLog = new Map();
const RATE_LIMIT = { maxRequests: 20, windowMs: 60000 };

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < RATE_LIMIT.windowMs);

  if (timestamps.length >= RATE_LIMIT.maxRequests) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Maximum 20 AI queries per minute.',
      retryable: true,
      retryAfterMs: RATE_LIMIT.windowMs - (now - timestamps[0]),
    });
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);
  next();
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestLog) {
    const active = timestamps.filter(t => now - t < RATE_LIMIT.windowMs);
    if (active.length === 0) requestLog.delete(ip);
    else requestLog.set(ip, active);
  }
}, 300000);

// --- Claude AI Proxy (streaming) ---

const ALLOWED_MODELS = ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'];

app.post('/api/ai/analyze', rateLimiter, async (req, res) => {
  const startTime = Date.now();

  try {
    const { system, messages, max_tokens = 1500, model } = req.body;

    // Validate request
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    if (max_tokens > 4000) {
      return res.status(400).json({ error: 'max_tokens cannot exceed 4000.' });
    }

    const inputSize = JSON.stringify(messages).length + (system?.length || 0);
    if (inputSize > 50000) {
      return res.status(400).json({ error: 'Request too large. Reduce data context.' });
    }

    const selectedModel = ALLOWED_MODELS.includes(model) ? model : 'claude-sonnet-4-20250514';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens,
        stream: true,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      let parsed;
      try { parsed = JSON.parse(errBody); } catch { parsed = { error: { message: errBody } }; }

      const status = response.status;
      const errorType = parsed?.error?.type || 'unknown';
      console.error(`Anthropic ${status} [${errorType}]:`, parsed?.error?.message);

      const userMessages = {
        429: 'AI analysis is temporarily rate-limited. Please wait 30 seconds and try again.',
        529: 'The AI service is currently overloaded. Please try again in a minute.',
        400: 'Invalid analysis request. Please try a different question.',
        401: 'AI service authentication error. Contact the administrator.',
        500: 'The AI service encountered an internal error. Please retry.',
      };

      return res.status(status).json({
        error: userMessages[status] || `AI analysis failed (${status}).`,
        retryable: [429, 529, 500].includes(status),
        retryAfterMs: status === 429 ? 30000 : (status === 529 ? 60000 : 5000),
      });
    }

    // Stream SSE back to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();

    console.log(`AI Request: model=${selectedModel} duration=${Date.now() - startTime}ms ip=${req.ip}`);
  } catch (err) {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI proxy error. Please retry.' });
    }
  }
});

createServer(app).listen(PORT, () => {
  console.log(`\n  Edmonton Fire Dashboard + AI Proxy`);
  console.log(`  http://localhost:${PORT}\n`);
});
