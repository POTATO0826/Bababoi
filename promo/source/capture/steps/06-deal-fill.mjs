export default async (page, h) => {
  const id = await h.get(() => window.__ware.getState().ledger.deals.find(d => d.code === "D-1001")?._id);
  await h.open("deals");
  await h.state({ detail: { kind: "deal", id } });
  await h.wait(2500);
  await page.getByPlaceholder("Name").fill("Demo buyer · PJ");
  const nums = page.locator('input[type=number]');
  await nums.nth(0).fill("2");
  await nums.nth(1).fill("1200");
  await h.wait(500);
  await h.shot("06a-deal-filled");
  await h.click("Save", { exact: true, after: 2500 });
  await h.shot("06b-deal-saved");
  console.log((await h.text()).slice(-2500));
};
