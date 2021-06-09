// Retrieves data from Mongo database
require('dotenv').config();

const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@price-history.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
let db;
let collection;
let rankedSymbols = []
let exchangeHistory
let ema1
let ema3
const dbName = "magic-money-tree";

async function run() {
  await setupDB()
  exchangeHistory = await dbRetrieve()
  rankedSymbols = rankSymbols(exchangeHistory)
  console.log(rankedSymbols)
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

function rankSymbols(symbols) {
  outputArray = []
  symbols.forEach(symbol => {
    ema1 = ema(symbol.history, 1, 'close')
    ema3 = ema(symbol.history, 3, 'close')
    outputArray.push({
      'symbol': symbol.pair,
      'movement': ema1/ema3 - 1
    })
  })
  return outputArray.sort((a, b) => b.movement - a.movement)
}

function ema(rawData, time, parameter) {
  let data = extractData(rawData, parameter)
  const k = 2/(time + 1)
  let emaData = []
  emaData[0] = data[0]
  for (let i = 1; i < data.length; i++) {
    let newPoint = (data[i] * k) + (emaData[i-1] * (1-k))
    emaData.push(newPoint)
  }
  let currentEma = [...emaData].pop()
  return +currentEma
}

function extractData(dataArray, key) {
  let outputArray = []
  dataArray.forEach(obj => {
    outputArray.push(obj[key])
  })
  return outputArray
}

run();
