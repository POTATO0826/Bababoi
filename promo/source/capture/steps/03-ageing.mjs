export default async (page, h) => {
  await h.open("ageing");
  await h.shot("03a-ageing-list");
  console.log((await h.text()).slice(0, 900));
  // click first ageing row (real UI: opens batch detail + shows on map)
  await page.locator("aside button").filter({ hasText: "B-2140-A" }).first().click();
  await h.wait(3500);
  await h.shot("03b-ageing-batch");
  console.log((await h.text()).slice(0, 2500));
};
