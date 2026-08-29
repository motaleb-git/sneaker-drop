import { DataTypes, Model } from "sequelize";
import { sequelize } from "../db/sequelize";

export type UserRole = "user" | "admin";

export class User extends Model {
  declare id: string;
  declare username: string;
  declare passwordHash: string;
  declare role: UserRole;
  declare createdAt: Date;
}

export function initUser(): void {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      username: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "password_hash",
      },
      role: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "user",
      },
    },
    {
      sequelize,
      tableName: "users",
      underscored: true,
      updatedAt: false,
    }
  );
}
