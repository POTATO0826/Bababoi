export default async (page, h) => {
  await h.open("deals");
  await h.shot("05a-deals-list");
  const id = await h.get(() => window.__ware.getState().ledger.deals.find(d => d.code === "D-1001")?._id);
  await h.state({ detail: { kind: "deal", id } });
  await h.wait(3000);
  await h.shot("05b-deal-sales");
  console.log((await h.text()).slice(0, 3500));
  const html = await page.evaluate(() => [...document.querySelectorAll('input,select,button,[role=combobox]')].map(e => `${e.tagName}|${e.getAttribute('type')||''}|${e.getAttribute('aria-label')||''}|${e.getAttribute('placeholder')||''}|${(e.innerText||e.value||'').slice(0,40)}`).join("\n"));
  console.log(html);
};
