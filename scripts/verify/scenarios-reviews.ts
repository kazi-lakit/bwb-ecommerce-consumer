import { summarizeRatings, type Review } from "@/lib/blocks/reviews";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
const r = (Rating: number, Status = "approved"): Review => ({ ItemId: "x" + Math.random(), Rating, Status });

export async function run(): Promise<number> {
  console.log("\nW1. an average over approved reviews");
  let s = summarizeRatings([r(5), r(4), r(3)]);
  check("average is 4", s.average === 4, String(s.average));
  check("count is 3", s.count === 3);
  check("histogram placed", s.histogram[5] === 1 && s.histogram[4] === 1 && s.histogram[3] === 1);

  console.log("\nW2. one decimal place, not fifteen");
  s = summarizeRatings([r(5), r(4)]);
  check("4.5", s.average === 4.5, String(s.average));
  s = summarizeRatings([r(5), r(4), r(4)]);
  check("4.3 not 4.333…", s.average === 4.3, String(s.average));

  console.log("\nW3. your own pending review doesn't move the public number");
  // It's visible to you by policy; counting it would show you a rating nobody else sees.
  s = summarizeRatings([r(5), r(1, "pending")]);
  check("average ignores pending", s.average === 5, String(s.average));
  check("count ignores pending", s.count === 1, String(s.count));
  s = summarizeRatings([r(5), r(1, "rejected")]);
  check("and rejected", s.average === 5 && s.count === 1);

  console.log("\nW4. nothing to average is null, not zero");
  // Zero would render as a zero-star rating, which is a claim about the product.
  s = summarizeRatings([]);
  check("null average", s.average === null);
  check("zero count", s.count === 0);
  s = summarizeRatings([r(4, "pending")]);
  check("null when only pending", s.average === null, String(s.average));

  console.log("\nW5. out-of-range and missing ratings are discarded");
  s = summarizeRatings([r(5), r(0), r(6), { ItemId: "z", Status: "approved" }]);
  check("only the valid one counts", s.count === 1, String(s.count));
  check("average is 5", s.average === 5);

  console.log("\nW6. a review with no status is treated as approved");
  // The gateway only returns approved rows to a stranger; a blank status is old data, not a
  // moderation decision, and hiding it would silently drop real reviews.
  s = summarizeRatings([{ ItemId: "a", Rating: 4 }]);
  check("counted", s.count === 1, String(s.count));

  console.log("\nW7. fractional ratings round into a bucket");
  s = summarizeRatings([{ ItemId: "a", Rating: 4.4, Status: "approved" }]);
  check("4.4 lands in 4", s.histogram[4] === 1, JSON.stringify(s.histogram));
  check("counted once", s.count === 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
