import assert from "node:assert/strict";
import { test } from "node:test";
import { ownPendingHolds } from "./reservations";

test("ownPendingHolds hides another user's hold", () => {
  const alice = "user-alice";
  const bob = "user-bob";
  const rows = [
    {
      id: "r1",
      dropId: "d1",
      userId: alice,
      status: "pending",
    },
    {
      id: "r2",
      dropId: "d1",
      userId: bob,
      status: "pending",
    },
    {
      id: "r3",
      dropId: "d2",
      userId: alice,
      status: "expired",
    },
  ];

  const aliceSees = ownPendingHolds(rows, alice);
  assert.equal(aliceSees.length, 1);
  assert.equal(aliceSees[0]?.id, "r1");

  const bobSees = ownPendingHolds(rows, bob);
  assert.equal(bobSees.length, 1);
  assert.equal(bobSees[0]?.id, "r2");
});
