export default async (page, h) => {
  await h.open("replenish");
  await page.locator("aside button").filter({ hasText: "3-Seater Sofa" }).first().click();
  await h.wait(3500);
  await h.shot("12a-replenish-open");
  console.log((await h.text()).slice(0, 1500));
  // Jarvis chat (typed, offline rules, ai=0)
  await h.state({ stage: "inventory", detail: null, zone: null, selected: null });
  await h.wait(800);
  await page.getByRole("button", { name: "Talk to Jarvis" }).click();
  await h.wait(2500);
  await h.shot("12b-jarvis-open");
  console.log("=====\n" + (await h.text()).slice(-1500));
};
