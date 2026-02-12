import { MongoClient, type MongoClientOptions } from "mongodb";

let cachedClient: MongoClient | null = null;

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function getMongoClientOptions(): MongoClientOptions {
  const allowInvalidCertificates = parseBooleanEnv(
    process.env.MONGODB_TLS_ALLOW_INVALID_CERTIFICATES,
  );
  const allowInvalidHostnames = parseBooleanEnv(
    process.env.MONGODB_TLS_ALLOW_INVALID_HOSTNAMES,
  );

  const options: MongoClientOptions = {
    serverSelectionTimeoutMS: 10_000,
  };

  if (allowInvalidCertificates !== undefined) {
    options.tlsAllowInvalidCertificates = allowInvalidCertificates;
  }

  if (allowInvalidHostnames !== undefined) {
    options.tlsAllowInvalidHostnames = allowInvalidHostnames;
  }

  if (process.env.MONGODB_TLS_CA_FILE) {
    options.tlsCAFile = process.env.MONGODB_TLS_CA_FILE;
  }

  return options;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) {
    return cachedClient;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  const client = new MongoClient(uri, getMongoClientOptions());
  await client.connect();
  cachedClient = client;

  return client;
}

function resetCachedClient(): void {
  if (cachedClient) {
    cachedClient.close(true).catch(() => {});
    cachedClient = null;
  }
}

export async function checkMongoHealth(): Promise<void> {
  try {
    const client = await getMongoClient();
    await client.db("admin").command({ ping: 1 });
  } catch (error) {
    resetCachedClient();
    throw error;
  }
}
