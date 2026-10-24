export default async (page, h) => {
  await h.open("receive");
  await h.shot("01a-receive-list");
  // open the pending delivery note
  const rid = await h.get(() => window.__ware.getState().ledger.receipts.find(r => r.status === "needs_review")?._id);
  await h.state({ detail: { kind: "receipt", id: rid }, floor: 1, zone: null, selected: null });
  await h.wait(2500);
  await h.shot("01b-receipt-detail");
  console.log((await h.text()).slice(0, 2500));
};
