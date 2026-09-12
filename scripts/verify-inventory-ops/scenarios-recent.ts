import { installFakeStorage } from "./fake-dom";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

export async function run(): Promise<number> {
  installFakeStorage("working");
  const mod = await import("@/lib/recently-viewed");
  const { recordProductView, clearRecentlyViewed, whereProductIds, sortByViewOrder } = mod;

  console.log("\nR1. views are recorded most-recent-first");
  installFakeStorage("working");
  clearRecentlyViewed();
  recordProductView("a");
  recordProductView("b");
  recordProductView("c");
  let ids = JSON.parse(localStorage.getItem("recently-viewed") ?? "[]") as string[];
  check("newest first", ids.join(",") === "c,b,a", ids.join(","));

  console.log("\nR2. re-viewing moves to the front instead of duplicating");
  recordProductView("a");
  ids = JSON.parse(localStorage.getItem("recently-viewed") ?? "[]") as string[];
  check("moved to front", ids[0] === "a", ids.join(","));
  check("no duplicate", ids.filter((id) => id === "a").length === 1, ids.join(","));
  check("others kept", ids.join(",") === "a,c,b", ids.join(","));

  console.log("\nR3. history is capped");
  installFakeStorage("working");
  clearRecentlyViewed();
  for (let i = 0; i < 30; i += 1) recordProductView(`p${i}`);
  ids = JSON.parse(localStorage.getItem("recently-viewed") ?? "[]") as string[];
  check("capped at 12", ids.length === 12, String(ids.length));
  check("keeps the newest", ids[0] === "p29");
  check("drops the oldest", !ids.includes("p0"));

  console.log("\nR4. an empty id is ignored");
  installFakeStorage("working");
  clearRecentlyViewed();
  recordProductView("");
  ids = JSON.parse(localStorage.getItem("recently-viewed") ?? "[]") as string[];
  check("nothing recorded", ids.length === 0, ids.join(","));

  console.log("\nR5. storage being unavailable never throws");
  installFakeStorage("throwing");
  let threw = false;
  try {
    recordProductView("x");
    clearRecentlyViewed();
  } catch {
    threw = true;
  }
  check("recording survives", !threw);

  console.log("\nR6. corrupt stored data is ignored rather than trusted");
  const map = installFakeStorage("working");
  map.set("recently-viewed", "not json at all");
  threw = false;
  try {
    recordProductView("a");
  } catch {
    threw = true;
  }
  check("survives garbage", !threw);
  ids = JSON.parse(localStorage.getItem("recently-viewed") ?? "[]") as string[];
  check("starts fresh", ids.join(",") === "a", ids.join(","));

  map.set("recently-viewed", JSON.stringify(["good", 42, null, "also-good"]));
  recordProductView("new");
  ids = JSON.parse(localStorage.getItem("recently-viewed") ?? "[]") as string[];
  check("non-strings dropped", ids.join(",") === "new,good,also-good", ids.join(","));

  console.log("\nR7. the fetch filter uses `or` of equals, not an assumed `in`");
  check("undefined when empty", whereProductIds([]) === undefined);
  const where = whereProductIds(["a", "b"]) as { or: { ItemId: { eq: string } }[] };
  check("or of two", where.or.length === 2);
  check("shaped as eq", where.or[0].ItemId.eq === "a" && where.or[1].ItemId.eq === "b");

  console.log("\nR8. results are reordered to match view order");
  const records = [{ id: "b" }, { id: "c" }, { id: "a" }];
  const sorted = sortByViewOrder(records, ["a", "b", "c"], (r) => r.id);
  check("view order restored", sorted.map((r) => r.id).join(",") === "a,b,c", sorted.map((r) => r.id).join(","));
  const withStranger = sortByViewOrder([{ id: "z" }, { id: "a" }], ["a"], (r) => r.id);
  check("unknown records sort last", withStranger.map((r) => r.id).join(",") === "a,z");
  check("input not mutated", records.map((r) => r.id).join(",") === "b,c,a");

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
