import { test, expect } from "@playwright/test";

test("ребёнок проходит квест и получает карту интересов", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Навигатор будущего/);
  await expect(page.getByRole("heading", { name: /Будущее начинается с тебя/ })).toBeVisible();

  await page.getByRole("button", { name: /Начать исследование/ }).click();
  await expect(page.getByRole("heading", { name: "Маяк подаёт странный сигнал" })).toBeVisible();

  for (let mission = 0; mission < 7; mission++) {
    const answers = page.locator(".answer");
    await expect(answers).toHaveCount(mission === 6 ? 5 : 4);
    await answers.first().click();
    await expect(page.locator("#feedback")).toBeVisible();
    await page.getByRole("button", { name: mission === 6 ? /Собрать мою карту/ : /Следующая миссия/ }).click();
  }

  await expect(page.locator("#result")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Твои выборы/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Профессии, на которые можно посмотреть/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Сохранить карту/ })).toBeVisible();

  const scoreLabels = await page.locator(".meterlabel").allTextContents();
  expect(scoreLabels).toHaveLength(5);
  const total = scoreLabels.reduce((sum, line) => sum + Number(line.match(/(\d+) из 7/)?.[1] ?? 0), 0);
  expect(total).toBe(7);

  await page.getByRole("button", { name: /Пройти ещё раз/ }).click();
  await expect(page.getByRole("button", { name: /Начать исследование/ })).toBeVisible();
});

test("интерфейс остаётся доступным на узком экране", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Начать исследование/ }).click();
  await expect(page.getByRole("heading", { name: "Маяк подаёт странный сигнал" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBe(false);
  await expect(page.locator(".answer").first()).toBeVisible();
});
