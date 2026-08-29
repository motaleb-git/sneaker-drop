import { DataTypes, Model } from "sequelize";
import { sequelize } from "../db/sequelize";

export class Purchase extends Model {
  declare id: string;
  declare dropId: string;
  declare userId: string;
  declare reservationId: string;
  declare createdAt: Date;
}

export function initPurchase(): void {
  Purchase.init(
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
      reservationId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        field: "reservation_id",
      },
    },
    {
      sequelize,
      tableName: "purchases",
      underscored: true,
      updatedAt: false,
    }
  );
}
