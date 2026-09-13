import { favouritesToCreate, mergeFavourites, type Favourite } from "@/lib/blocks/favourites";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
const remote = (...ids: string[]): Favourite[] => ids.map((ProductId, i) => ({ ItemId: "r" + i, ProductId }));

export async function run(): Promise<number> {
  console.log("\nF1. a guest's wishlist is pushed up on sign-in");
  check("all new ids", favouritesToCreate(["a", "b"], []).join(",") === "a,b");
  check("merged view has both", mergeFavourites(["a", "b"], []).sort().join(",") === "a,b");

  console.log("\nF2. what's already on the server isn't posted twice");
  check("only the new one", favouritesToCreate(["a", "b"], remote("a")).join(",") === "b");
  check("no duplicates in the view", mergeFavourites(["a", "b"], remote("a")).length === 2,
    mergeFavourites(["a", "b"], remote("a")).join(","));

  console.log("\nF3. merging never removes");
  // A phone favourite absent locally means "not synced here", not "removed" — there's no
  // per-item timestamp to tell those apart, and deleting someone's saved item is the mistake
  // they'd notice and mind.
  const view = mergeFavourites([], remote("x", "y"));
  check("server-only items survive an empty local list", view.sort().join(",") === "x,y", view.join(","));
  check("nothing to create", favouritesToCreate([], remote("x", "y")).length === 0);

  console.log("\nF4. duplicates within the local list collapse");
  check("create list deduped", favouritesToCreate(["a", "a", "b"], []).join(",") === "a,b");
  check("view deduped", mergeFavourites(["a", "a"], remote("a")).join(",") === "a");

  console.log("\nF5. empty and malformed ids are dropped, not posted");
  check("empty string skipped", favouritesToCreate(["", "a"], []).join(",") === "a");
  check("view skips empties", mergeFavourites(["", "a"], []).join(",") === "a");
  check("server rows with no product id are ignored",
    mergeFavourites(["a"], [{ ItemId: "r9" }]).join(",") === "a");

  console.log("\nF6. the server copy leads the merged order");
  // What's already saved is what the customer expects to see first on a new device.
  check("remote first", mergeFavourites(["local"], remote("saved")).join(",") === "saved,local");

  console.log("\nF7. both sides empty is empty, not an error");
  check("no create", favouritesToCreate([], []).length === 0);
  check("no view", mergeFavourites([], []).length === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
