export default async (page, h) => {
  const id = await h.get(() => window.__ware.getState().ledger.deals.find(d => d.code === "D-1001")?._id);
  await h.open("deals");
  await h.state({ detail: { kind: "deal", id } });
  await h.wait(2500);
  await h.click("Confirm location with buyer", { exact: true, after: 2500 });
  await h.shot("07a-location-confirmed");
  console.log((await h.text()).slice(-1800));
  // Synthetic carrier replies (demo mode) — labelled "Synthetic" in the real UI
  await h.click("Demo", { exact: true, after: 3500 });
  await h.shot("07b-quotes");
  console.log("=====\n" + (await h.text()).slice(-2500));
};
