export default async (page, h) => {
  const id = await h.get(() => window.__ware.getState().ledger.deals.find(d => d.code === "D-1001")?._id);
  await h.open("deals");
  await h.state({ detail: { kind: "deal", id } });
  await h.wait(2500);
  await page.getByText("Carrier A").first().click();
  await h.wait(800);
  await h.shot("08a-quote-picked");
  await h.click("Send to Mei", { exact: true, after: 3000 });
  await h.shot("08b-sent");
  console.log((await h.text()).slice(-1500));
};
