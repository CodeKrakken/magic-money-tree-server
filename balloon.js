// Retrieves data from Mongo database
require('dotenv').config();

const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@price-history.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
let db;
let collection;
const dbName = "magic-money-tree";

async function run() {
  await setupDB()
  exchangeHistory = await dbRetrieve()
  console.log(exchangeHistory)
}

async function setupDB() {
  await mongo.connect()
  console.log("Connected correctly to server");
  db = mongo.db(dbName);
  collection = db.collection("symbols")
}

async function dbRetrieve() {
  console.log('Retrieving data from database')
  const data = await collection.find().toArray();
  return data
}


run();
