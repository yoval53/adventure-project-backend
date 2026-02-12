import { MongoClient } from "mongodb";

let cachedClient: MongoClient | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) {
    return cachedClient;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;

  return client;
}

export async function checkMongoHealth(): Promise<void> {
  const client = await getMongoClient();
  await client.db("admin").command({ ping: 1 });
}
