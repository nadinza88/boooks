import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("welcome screen starts the first mission", async ({ page }) => {
  await expect(page).toHaveTitle(/Навигатор будущего/);
  await expect(page.getByRole("heading", { name: /Помоги Фоксу найти своё дело/ })).toBeVisible();

  await page.getByRole("button", { name: /Начать приключение/ }).click();

  await expect(page.locator("#stepLabel")).toHaveText("ПРИКЛЮЧЕНИЕ 1 ИЗ 9");
  await expect(page.getByRole("heading", { name: "Помоги Фоксу выбрать занятие" })).toBeVisible();
  await expect(page.locator("#mission .answer")).toHaveCount(5);
});

test("a child can complete all nine missions and see the interest map", async ({ page }) => {
  await page.getByRole("button", { name: /Начать приключение/ }).click();

  for (let mission = 0; mission < 9; mission += 1) {
    await expect(page.locator("#stepLabel")).toHaveText(`ПРИКЛЮЧЕНИЕ ${mission + 1} ИЗ 9`);
    await expect(page.locator("#mission .answer")).toHaveCount(5);
    await page.locator("#mission .answer").first().click();
    await expect(page.locator("#feedback")).toBeVisible();
    await page.locator("#next").click();
  }

  await expect(page.locator("#result")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Твоя карта интересов" })).toBeVisible();
  await expect(page.locator("#result .scoreline")).toHaveCount(5);
  await expect(page.locator("#result .scoreline b").first()).toContainText("из 9");
  await expect(page.getByRole("button", { name: /Сыграть ещё раз/ })).toBeVisible();
});

test("the current answer can be undone without adding a score", async ({ page }) => {
  await page.getByRole("button", { name: /Начать приключение/ }).click();
  await page.locator("#mission .answer").first().click();
  await expect(page.locator("#mission .answer.chosen")).toHaveCount(1);

  await page.getByRole("button", { name: /Отменить выбор/ }).click();

  await expect(page.locator("#stepLabel")).toHaveText("ПРИКЛЮЧЕНИЕ 1 ИЗ 9");
  await expect(page.locator("#feedback")).toBeHidden();
  await expect(page.locator("#mission .answer:disabled")).toHaveCount(0);
});

test("the previous mission can be reopened before answering the current one", async ({ page }) => {
  await page.getByRole("button", { name: /Начать приключение/ }).click();
  await page.locator("#mission .answer").first().click();
  await page.locator("#next").click();

  await expect(page.locator("#stepLabel")).toHaveText("ПРИКЛЮЧЕНИЕ 2 ИЗ 9");
  await page.getByRole("button", { name: /Вернуться и изменить прошлый ответ/ }).click();

  await expect(page.locator("#stepLabel")).toHaveText("ПРИКЛЮЧЕНИЕ 1 ИЗ 9");
  await expect(page.getByRole("heading", { name: "Помоги Фоксу выбрать занятие" })).toBeVisible();
  await expect(page.locator("#mission .answer:disabled")).toHaveCount(0);
});

test("answer cards stack on a narrow mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Начать приключение/ }).click();

  const columns = await page.locator("#mission .answers").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length
  );
  expect(columns).toBe(1);
});

test("the result print action calls the browser print dialog", async ({ page }) => {
  await page.getByRole("button", { name: /Начать приключение/ }).click();
  await page.evaluate(() => {
    window.print = () => { window.__printCalled = true; };
  });

  for (let mission = 0; mission < 9; mission += 1) {
    await page.locator("#mission .answer").first().click();
    await page.locator("#next").click();
  }

  await page.getByRole("button", { name: /Сохранить результат в PDF/ }).click();
  await expect.poll(() => page.evaluate(() => window.__printCalled)).toBe(true);
});
