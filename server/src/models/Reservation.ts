import { DataTypes, Model } from "sequelize";
import { sequelize } from "../db/sequelize";

export type ReservationStatus = "pending" | "purchased" | "expired";

export class Reservation extends Model {
  declare id: string;
  declare dropId: string;
  declare userId: string;
  declare status: ReservationStatus;
  declare expiresAt: Date;
  declare createdAt: Date;
}

export function initReservation(): void {
  Reservation.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      dropId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "drop_id",
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      status: {
        type: DataTypes.ENUM("pending", "purchased", "expired"),
        allowNull: false,
        defaultValue: "pending",
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "expires_at",
      },
    },
    {
      sequelize,
      tableName: "reservations",
      underscored: true,
      updatedAt: false,
    }
  );
}
