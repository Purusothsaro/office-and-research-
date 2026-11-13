import { MongoClient } from "mongodb";

/** Starts every run from an empty e2e database (never touches other databases). */
export default async function globalSetup() {
  const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017");
  await client.connect();
  await client.db("octogenie_office_e2e").dropDatabase();
  await client.close();
}
