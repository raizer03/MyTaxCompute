/**
 * MyTax Compute — OpenAI API Proxy
 * Netlify serverless function: netlify/functions/claude.js
 *
 * Translates the app's requests into OpenAI format and returns
 * responses in a compatible format — no changes needed to index.html.
 *
 * Set your key in: Netlify → Project configuration → Environment variables
 * Key name: OPENAI_API_KEY
 * Value: sk-...
 */

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: { message: "Method Not Allowed" } }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: {
          message:
            "OPENAI_API_KEY is not set. Go to Netlify → Project configuration → " +
            "Environment variables and add OPENAI_API_KEY with your OpenAI key.",
        },
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // ── Convert Anthropic-format request → OpenAI format ──
    const messages = [];

    // System prompt
    if (body.system) {
      messages.push({ role: "system", content: body.system });
    }

    // User / assistant messages
    for (const msg of body.messages || []) {
      if (typeof msg.content === "string") {
        messages.push({ role: msg.role, content: msg.content });
        continue;
      }

      if (Array.isArray(msg.content)) {
        const parts = [];
        for (const part of msg.content) {
          if (part.type === "text") {
            parts.push({ type: "text", text: part.text });
          } else if (part.type === "document" && part.source?.type === "base64") {
            // PDF — send as base64 file to GPT-4o
            parts.push({
              type: "file",
              file: {
                filename: "document.pdf",
                file_data: "data:application/pdf;base64," + part.source.data,
              },
            });
          }
        }
        messages.push({ role: msg.role, content: parts });
      }
    }

    // ── Call OpenAI ──
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: body.max_tokens || 4000,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: { message: data.error?.message || "OpenAI error " + response.status },
        }),
      };
    }

    // ── Return in Anthropic-compatible format (so index.html needs no changes) ──
    const text = data.choices?.[0]?.message?.content || "";
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        content: [{ type: "text", text }],
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: { message: "Proxy error: " + err.message } }),
    };
  }
};
