import { User, initUser } from "./User";
import { Drop, initDrop } from "./Drop";
import { Reservation, initReservation } from "./Reservation";
import { Purchase, initPurchase } from "./Purchase";

export function initModels(): void {
  initUser();
  initDrop();
  initReservation();
  initPurchase();

  User.hasMany(Reservation, { foreignKey: "userId", onDelete: "CASCADE" });
  User.hasMany(Purchase, { foreignKey: "userId", onDelete: "CASCADE" });
  Drop.hasMany(Reservation, { foreignKey: "dropId", onDelete: "CASCADE" });
  Drop.hasMany(Purchase, { foreignKey: "dropId", onDelete: "CASCADE" });
  Reservation.belongsTo(User, { foreignKey: "userId" });
  Reservation.belongsTo(Drop, { foreignKey: "dropId" });
  Reservation.hasOne(Purchase, { foreignKey: "reservationId" });
  Purchase.belongsTo(User, { foreignKey: "userId" });
  Purchase.belongsTo(Drop, { foreignKey: "dropId" });
  Purchase.belongsTo(Reservation, { foreignKey: "reservationId" });
}

export { User, Drop, Reservation, Purchase };
