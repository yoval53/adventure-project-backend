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

  const options = getMongoClientOptions();

  console.log("[db] Connecting to MongoDB...", {
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
    tlsAllowInvalidCertificates: options.tlsAllowInvalidCertificates,
    tlsAllowInvalidHostnames: options.tlsAllowInvalidHostnames,
    tlsCAFile: options.tlsCAFile ?? "(not set)",
  });

  const client = new MongoClient(uri, options);

  try {
    await client.connect();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[db] MongoDB connection failed:", {
      name: err.name,
      message: err.message,
      code: (err as NodeJS.ErrnoException).code,
      stack: err.stack,
    });
    throw error;
  }

  cachedClient = client;
  console.log("[db] MongoDB connected successfully");

  return client;
}

export function isTlsError(message: string): boolean {
  return /ssl|tls/i.test(message);
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
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[db] Health check error details:", {
      name: err.name,
      message: err.message,
      code: (err as NodeJS.ErrnoException).code,
      stack: err.stack,
    });

    if (isTlsError(err.message)) {
      console.error("[db] TLS/SSL error detected. Current TLS env config:", {
        MONGODB_TLS_ALLOW_INVALID_CERTIFICATES: process.env.MONGODB_TLS_ALLOW_INVALID_CERTIFICATES ?? "(not set)",
        MONGODB_TLS_ALLOW_INVALID_HOSTNAMES: process.env.MONGODB_TLS_ALLOW_INVALID_HOSTNAMES ?? "(not set)",
        MONGODB_TLS_CA_FILE: process.env.MONGODB_TLS_CA_FILE ?? "(not set)",
      });
      console.error("[db] Hint: If using self-signed certs, set MONGODB_TLS_ALLOW_INVALID_CERTIFICATES=true");
    }

    resetCachedClient();
    throw error;
  }
}
