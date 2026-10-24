export default async (page, h) => {
  await h.open("collect");
  const id = await h.get(() => window.__ware.getState().ledger.deals.find(d => d.code === "D-1001")?._id);
  await h.state({ detail: { kind: "deal", id } });
  await h.wait(3000);
  await h.shot("10a-collect");
  await h.click("Goods collected", { after: 1200 });
  await h.shot("10b-collect-confirm");
  await h.click("left the warehouse", { after: 3500 });
  await h.shot("10c-collected");
  console.log((await h.text()).slice(-1200));
};
