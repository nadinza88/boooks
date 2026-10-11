/**
 * Книжная мастерская NeuroGym — Cloudflare Worker API
 * Static frontend is served from ./public via the ASSETS binding in wrangler.toml.
 * AI binding name: AI (Cloudflare Workers AI). Secrets are never exposed to the browser.
 */
const MODEL_TEXT = "@cf/qwen/qwen3-30b-a3b-fp8";
const MODEL_IMAGE = "@cf/black-forest-labs/flux-2-klein-9b";
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};
const json = (body, status = 200) => Response.json(body, { status, headers: JSON_HEADERS });
const clip = (value, max) => String(value ?? "").trim().slice(0, max);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...JSON_HEADERS, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
      if (request.method === "GET" && url.pathname === "/api/status") return json({ connected: Boolean(env.AI), provider: env.AI ? "cloudflare-workers-ai" : "demo" });
      if (request.method !== "POST") return json({ error: "Метод не поддерживается." }, 405);
      if (url.pathname !== "/api/story" && url.pathname !== "/api/image") return json({ error: "Маршрут не найден." }, 404);
      if (!env.AI) return json({ error: "Workers AI не подключён. Демо-режим остаётся доступен." }, 503);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Ожидается корректный JSON." }, 400); }
      if (url.pathname === "/api/story") {
        const idea = clip(body.idea, 700);
        if (!idea) return json({ error: "Добавь идею истории." }, 400);
        const allowedAges = new Set(["7–9", "10–12", "13–14"]);
        const allowedCounts = new Set([4, 6, 8]);
        const allowedGenres = new Set(["Приключение", "Сказка", "Юмор", "Фантастика", "Детектив", "Добрая история о дружбе"]);
        const age = allowedAges.has(body.age) ? body.age : "10–12";
        const count = allowedCounts.has(Number(body.count)) ? Number(body.count) : 6;
        const genre = allowedGenres.has(body.genre) ? body.genre : "Приключение";
        const heroName = clip(body.name, 50);
        const extra = clip(body.moral, 180);
        const system = `Ты — автор детских иллюстрированных книг на русском языке для детей ${age} лет. Жанр: ${genre}. Напиши оригинальную, логичную историю с началом, развитием и завершением. Без жестокости, сексуального контента, опасных инструкций, унижений и персональных данных. Не добавляй нравоучительные шаблоны. Верни только JSON без Markdown: {"title":"название","coverEmoji":"emoji","subtitle":"описание","pages":[{"heading":"заголовок","text":"литературный текст","imagePrompt":"подробная сцена для акварельной иллюстрации"}]}. Ровно ${count} страниц. Каждый эпизод двигает сюжет. Сначала создай characters — паспорт всех повторяющихся персонажей: точный вид, вид животного/человека, возраст, цвет и форма глаз, шерсти/волос, одежда, аксессуары и отличительные черты. В imagePrompt каждой страницы подробно указывай, какие именно персонажи из паспорта присутствуют и что они делают; не меняй их внешность и одежду между сценами. Верни JSON с полями title, coverEmoji, subtitle, characters: [{name, visualDescription}], pages: [{heading, text, imagePrompt}]. Промпты без букв, текста и водяных знаков.`;
        const user = `Идея ребёнка: ${idea}
Имя героя: ${heroName || "придумай подходящее"}
Пожелания: ${extra || "нет"}`;
        try {
          const result = await env.AI.run(MODEL_TEXT, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 4096, temperature: 0.4 });
          let raw = [result?.response, result?.choices?.[0]?.message?.content, result?.choices?.[0]?.text, result?.output_text].find(v => typeof v === "string" && v.trim()) || "";
          raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
          let book;
          try { book = JSON.parse(raw); } catch { throw new Error("Модель вернула некорректный JSON. Попробуй ещё раз."); }
          if (!book || !Array.isArray(book.pages) || book.pages.length < 1) throw new Error("В ответе модели нет страниц.");
          book.characters = Array.isArray(book.characters) ? book.characters.slice(0, 8).map(c => ({ name: clip(c?.name, 80), visualDescription: clip(c?.visualDescription, 500) })).filter(c => c.name && c.visualDescription) : [];
          book.pages = book.pages.slice(0, count).map((p, i) => ({ heading: clip(p?.heading || `Страница ${i+1}`, 120), text: clip(p?.text, 1400), imagePrompt: clip(p?.imagePrompt || p?.text, 1800) }));
          if (book.pages.length !== count) throw new Error("Модель создала не все страницы. Попробуй ещё раз.");
          return json({ title: clip(book.title || "Моя первая книга", 120), coverEmoji: clip(book.coverEmoji || "📚", 8), subtitle: clip(book.subtitle || "История по твоей идее", 180), characters: book.characters, pages: book.pages });
        } catch (e) { return json({ error: `Не удалось создать историю: ${clip(e?.message || e, 250)}` }, 502); }
      }
      const prompt = clip(body.prompt, 1800);
      if (!prompt) return json({ error: "Не задано описание иллюстрации." }, 400);
      try {
        const fullPrompt = `${prompt}. Детская книжная иллюстрация в стиле акварели и гуаши, фактура бумаги и мазков кисти, цельная композиция, мягкий естественный свет, выразительные эмоции, гармоничная палитра. Точно соблюдай описание персонажей и сцену. Без текста, букв, логотипов и водяных знаков.`;
        const reference = typeof body.referenceImage === "string" ? body.referenceImage.replace(/^data:image\/[^;]+;base64,/, "") : "";
        const form = new FormData();
        form.append("prompt", reference
          ? `Используй изображение 1 как визуальный референс для сохранения идентичности персонажей и художественного стиля. Сохрани вид животного/человека, пропорции, цвета, лицо, шерсть/волосы и одежду. Измени позу, действие и фон согласно новой сцене: ${fullPrompt}`
          : fullPrompt);
        form.append("width", "768");
        form.append("height", "1024");
        if (reference) {
          const binary = Uint8Array.from(atob(reference), c => c.charCodeAt(0));
          form.append("input_image_0", new Blob([binary], { type: "image/jpeg" }), "character-reference.jpg");
        }
        const serialized = new Response(form);
        const result = await env.AI.run(MODEL_IMAGE, {
          multipart: { body: serialized.body, contentType: serialized.headers.get("content-type") }
        });
        if (!result?.image) throw new Error("Модель не вернула изображение.");
        return json({ image: result.image });
      } catch (e) { return json({ error: `Не удалось создать иллюстрацию: ${clip(e?.message || e, 250)}` }, 502); }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
  }
};
