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
        const system = \`Ты — сильный современный автор художественной прозы для детей и подростков на русском языке. Возраст читателя: \${age}. Жанр: \${genre}. Напиши оригинальную полноценную историю с выразительным началом, нарастающим конфликтом, неожиданными, но логичными поворотами, эмоциональной глубиной и финалом, который вытекает из выбора героев. Не делай текст пересказом идеи и не своди его к набору коротких эпизодов. Не пиши примитивно, назидательно или шаблонно; избегай фраз вроде «они поняли, что дружба важнее всего». Диалоги должны звучать естественно и раскрывать характеры. Сохраняй причинно-следственную связь между всеми страницами, имена и детали мира.

ВОЗРАСТ И СЛОЖНОСТЬ: Для 7–9 лет — ясный язык, конкретные действия, юмор и приключение. Для 10–12 лет — литературный, образный язык, сложная загадка или цель, препятствия и последствия решений, неоднозначные чувства, герои с недостатками и развитием; ориентир 150–220 слов на страницу. Для 13–14 лет — полноценная подростковая проза с подтекстом, психологической достоверностью, морально неоднозначным выбором, оригинальными метафорами и многослойным конфликтом; ориентир 200–300 слов на страницу. Не упрощай стиль для старших возрастов.

СТРУКТУРА: Ровно \${count} страниц, но это части единого рассказа, а не независимые мини-сказки. Первая страница сразу захватывает необычным событием или тревожным вопросом. Каждая следующая меняет ситуацию и повышает ставки. Финал должен быть содержательным, эмоционально заслуженным и не обязательно морализаторским. Не начинай каждую страницу заново. Заголовок страницы (heading) оставляй пустой строкой для ВСЕХ страниц, кроме первой, и даже на первой используй его только если это действительно название главы, а не название всей книги. Перед выдачей результата перечитай весь рассказ как редактор: исправь орфографию, пунктуацию, падежи и неестественные формулировки; особенно внимательно проверяй окончания слов и написание слов по нормам русского языка. Для возраста 10–12 лет каждая страница должна содержать 150–220 слов, для 13–14 лет — 200–300 слов; не заменяй полноценный рассказ несколькими короткими предложениями. Верни только корректный JSON без Markdown с полями: title, subtitle, characters: [{name, visualDescription}], pages: [{heading, text, imagePrompt}]. Не добавляй emoji и технические подписи в название или обложку.

ИЛЛЮСТРАЦИИ: В characters опиши каждого постоянного героя с точными чертами внешности, одеждой, цветами и отличительными деталями. В imagePrompt каждой страницы дай конкретную визуальную сцену: место, время, действие, эмоцию, композицию и присутствующих персонажей. Иллюстрация должна изображать именно описанное событие этой страницы, а не просто портрет героев. Сохраняй дизайн персонажей между сценами. Промпты без букв, текста, подписей и водяных знаков. Без жестокости, сексуального контента, опасных инструкций, унижений и персональных данных.\`;
        const user = `Идея ребёнка: ${idea}
Имя героя: ${heroName || "придумай подходящее"}
Пожелания: ${extra || "нет"}`;
        try {
          const result = await env.AI.run(MODEL_TEXT, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 8192, temperature: 0.4 });
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
