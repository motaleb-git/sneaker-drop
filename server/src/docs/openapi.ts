export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Sneaker Drop API",
    version: "1.0.0",
    description:
      "Limited-edition merch drop: atomic 60s reservations, purchases, and live stock.",
  },
  servers: [{ url: "http://localhost:4000", description: "Local" }],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Drops" },
    { name: "Reservations" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          code: { type: "string" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          username: { type: "string" },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      Credentials: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: {
            type: "string",
            minLength: 3,
            maxLength: 32,
            example: "alice",
          },
          password: {
            type: "string",
            minLength: 8,
            example: "password123",
          },
        },
      },
      Purchaser: {
        type: "object",
        properties: {
          username: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Drop: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          priceCents: { type: "integer" },
          totalStock: { type: "integer" },
          availableStock: { type: "integer" },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          recentPurchasers: {
            type: "array",
            items: { $ref: "#/components/schemas/Purchaser" },
          },
        },
      },
      CreateDrop: {
        type: "object",
        required: ["name", "priceCents", "totalStock"],
        properties: {
          name: { type: "string", example: "Air Jordan 1 - 100 units" },
          priceCents: { type: "integer", example: 18000 },
          totalStock: { type: "integer", example: 100 },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
        },
      },
      Reservation: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          dropId: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["pending", "purchased", "expired"] },
          expiresAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    db: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Credentials" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" },
              },
            },
          },
          "409": {
            description: "Username taken",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Credentials" },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" },
              },
            },
          },
          "401": {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/drops": {
      get: {
        tags: ["Drops"],
        summary: "List drops with top 3 purchasers",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    drops: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Drop" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Drops"],
        summary: "Create a merch drop",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateDrop" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { drop: { $ref: "#/components/schemas/Drop" } },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/drops/{id}/reserve": {
      post: {
        tags: ["Drops"],
        summary: "Atomically reserve 1 unit for 60 seconds",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "201": {
            description: "Reserved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reservation: { $ref: "#/components/schemas/Reservation" },
                    availableStock: { type: "integer" },
                  },
                },
              },
            },
          },
          "400": { description: "Not live / ended" },
          "409": { description: "Sold out or already reserved" },
        },
      },
    },
    "/api/reservations/{id}/purchase": {
      post: {
        tags: ["Reservations"],
        summary: "Complete purchase for your pending reservation",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "201": {
            description: "Purchased",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    purchaseId: { type: "string", format: "uuid" },
                    dropId: { type: "string", format: "uuid" },
                    createdAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "403": { description: "Not your reservation" },
          "409": { description: "Expired or already purchased" },
        },
      },
    },
    "/api/me/reservations": {
      get: {
        tags: ["Reservations"],
        summary: "Current user's pending reservations",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reservations: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Reservation" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
