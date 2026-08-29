import { DataTypes, Model } from "sequelize";
import { sequelize } from "../db/sequelize";

export class Drop extends Model {
  declare id: string;
  declare name: string;
  declare priceCents: number;
  declare totalStock: number;
  declare availableStock: number;
  declare startsAt: Date;
  declare endsAt: Date | null;
  declare createdAt: Date;
}

export function initDrop(): void {
  Drop.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      priceCents: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "price_cents",
      },
      totalStock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "total_stock",
      },
      availableStock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "available_stock",
      },
      startsAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "starts_at",
      },
      endsAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "ends_at",
      },
    },
    {
      sequelize,
      tableName: "drops",
      underscored: true,
      updatedAt: false,
    }
  );
}
