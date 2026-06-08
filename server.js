// ====== AI CHAT PROXY ======
app.post("/api/chat", auth, async (req, res) => {
  const { provider, model, apiKey, messages } = req.body;
  if (!apiKey) return res.json({ error: "API key missing" });
  try {
    let reply;
    if (provider === "nvidia") {
      const rr = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({ model, messages }),
      });
      const d = await rr.json();
      if (d.error) throw new Error(d.error.message);
      reply = d.choices[0].message.content;
    } else if (["openai", "deepseek", "mistral", "groq", "xai"].includes(provider)) {
      const urls = {
        openai: "https://api.openai.com/v1/chat/completions",
        deepseek: "https://api.deepseek.com/v1/chat/completions",
        mistral: "https://api.mistral.ai/v1/chat/completions",
        groq: "https://api.groq.com/openai/v1/chat/completions",
        xai: "https://api.x.ai/v1/chat/completions",
      };
      const rr = await fetch(urls[provider], {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({ model, messages }),
      });
      const d = await rr.json();
      if (d.error) throw new Error(d.error.message);
      reply = d.choices[0].message.content;
    } else if (provider === "anthropic") {
      const rr = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 2048, messages }),
      });
      const d = await rr.json();
      if (d.error) throw new Error(d.error.message);
      reply = d.content[0].text;
    } else if (provider === "google") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const rr = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }) });
      const d = await rr.json();
      if (d.error) throw new Error(d.error.message);
      reply = d.candidates[0].content.parts[0].text;
    } else throw new Error("Unknown provider");
    res.json({ reply });
  } catch (err) {
    res.json({ error: err.message });
  }
});
