export default async (page, h) => {
  const rid = await h.get(() => window.__ware.getState().ledger.receipts.find(r => r.status === "needs_review")?._id);
  await h.open("receive");
  await h.state({ detail: { kind: "receipt", id: rid }, floor: 1, zone: null, selected: null });
  await h.wait(2000);
  await page.getByText("Counted and checked").first().click();
  await h.wait(1500);
  await h.shot("02a-receipt-verified");
  await h.click("Post to stock", { after: 3000 });
  await h.shot("02b-receipt-posted");
  console.log((await h.text()).slice(0, 1800));
};
