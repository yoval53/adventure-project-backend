"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMongoClient = getMongoClient;
exports.checkMongoHealth = checkMongoHealth;
const mongodb_1 = require("mongodb");
let cachedClient = null;
async function getMongoClient() {
    if (cachedClient) {
        return cachedClient;
    }
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error("MONGODB_URI environment variable is not set");
    }
    const client = new mongodb_1.MongoClient(uri);
    await client.connect();
    cachedClient = client;
    return client;
}
async function checkMongoHealth() {
    const client = await getMongoClient();
    await client.db("admin").command({ ping: 1 });
}
