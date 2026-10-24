export default async (page, h) => {
  await h.open("approve");
  await h.shot("09a-approvals-list");
  const id = await h.get(() => window.__ware.getState().ledger.deals.find(d => d.code === "D-1001")?._id);
  await h.state({ detail: { kind: "deal", id } });
  await h.wait(3000);
  await h.shot("09b-approval");
  console.log((await h.text()).slice(-2000));
  await h.click("Approve", { exact: true, after: 3500 });
  await h.shot("09c-approved");
  console.log("=====\n" + (await h.text()).slice(-2000));
};
