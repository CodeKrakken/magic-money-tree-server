require('dotenv').config();

const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@price-history.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

const dbName = "test";

async function run() {
  try {
    await client.connect();
    console.log("Connected correctly to server");
    const db = client.db(dbName);
    const col = db.collection("people");
    let personDocument = {
      "name": { "first": "Alan", "second": "Turing" },
      "birth": new Date(1912, 5, 23),
      "death": new Date(1954, 5, 7),
      "contribs": ["Turing machine", "Turing test", "Turingery"],
      "views": 1250000
    }
    const p = await col.insertOne(personDocument);
    const myDoc = await col.findOne();
    console.log(myDoc)
  } catch (err) {
    console.log(err.stack);
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
