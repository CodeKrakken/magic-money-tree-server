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
const dbName = "magic-money-tree";

async function run() {
  await setupDB()
  exchangeHistory = await dbRetrieve()
  exchangeHistory = await collateData(exchangeHistory)
  // rankedSymbols = rankSymbols(exchangeHistory)
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

async function collateData(data) {
  let symbols = {}
  data.forEach(symbol => {
    let periods = []
    symbol.history.forEach(period => {
      periods.push({
        'startTime': period[0],
        'open': period[1],
        'high': period[2],
        'low': period[3],
        'close': period[4],
        'endTime': period[6]
      })
    })
    symbols[symbol] = periods
  })
  return symbols
}

function rankSymbols(symbols) {
  outputObject = {}
  symbols.forEach(symbol => {
    const ema1 = ema(symbol, 1, 'close')
    const ema3 = ema(symbol, 3, 'close')
  })

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

run();
