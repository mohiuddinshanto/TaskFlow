import "dotenv/config";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { randomBytes } from "node:crypto";
import { database, getMongoClient } from "../../server/db";

const client = getMongoClient();
const dbName = process.env.MONGODB_DB_NAME;
const db = client?.db(dbName);

if (!process.env.BETTER_AUTH_SECRET && !process.env.AUTH_SECRET) {
  throw new Error("Set BETTER_AUTH_SECRET (or AUTH_SECRET) in the environment before starting the server.");
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 3000}`,
  database: db && client
    ? mongodbAdapter(db, process.env.MONGODB_REPLICA_SET === "true" ? { client } : {})
    : undefined,
  emailAndPassword: { enabled: true },
  advanced: { database: { joins: true } },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const existing = database.getUserById(user.id) || database.getUserByEmail(user.email);
          if (!existing) {
            await database.createUser({
              id: user.id,
              name: user.name,
              email: user.email,
              role: "member",
              jobTitle: "Team Member",
              department: "Operations",
              avatar: user.image || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`,
              createdAt: user.createdAt.toISOString(),
              updatedAt: user.updatedAt.toISOString(),
              passwordHash: randomBytes(32).toString("hex"),
            });
          } else if (existing.name !== user.name || existing.id !== user.id) {
            database.updateUser(existing.id, { name: user.name });
          }
        },
      },
    },
  },
});

export async function connectAuthMongo(): Promise<void> {
  if (!client) return;
  if (!dbName) throw new Error("MONGODB_DB_NAME is required for authentication storage.");
  // The Native Driver client is connected by initDatabase; auth shares that same pool.
}
