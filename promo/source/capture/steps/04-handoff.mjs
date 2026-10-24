export default async (page, h) => {
  await h.open("ageing");
  await page.locator("aside button").filter({ hasText: "B-2140-A" }).first().click();
  await h.wait(3000);
  await h.click("Hand to Arif", { after: 3500 });
  await h.shot("04a-handed");
  console.log((await h.text()).slice(0, 3000));
};
