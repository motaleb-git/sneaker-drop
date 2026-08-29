export type Hold = {
  id: string;
  dropId: string;
  userId: string;
  status: string;
};

export function ownPendingHolds<T extends Hold>(
  reservations: T[],
  userId: string
): T[] {
  return reservations.filter(
    (row) => row.status === "pending" && row.userId === userId
  );
}
