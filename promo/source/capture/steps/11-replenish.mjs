export default async (page, h) => {
  await h.open("replenish");
  await h.wait(1500);
  await h.shot("11a-replenish");
  console.log((await h.text()).slice(0, 2500));
};
