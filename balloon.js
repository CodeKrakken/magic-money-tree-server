// Retrieves data from Mongo database
require('dotenv').config();

const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@price-history.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
let db;
let collection;
let exchangeHistory
let ema1
let ema3
const dbName = "magic-money-tree";

async function run() {
  await setupDB()
  await mainProgram()
}

async function mainProgram() {
  exchangeHistory = await dbRetrieve()
  rankedByMovement = await rankMovement(exchangeHistory)
  console.log(`Movement chart`)
  await console.log(rankedByMovement)

}

async function setupDB() {
  await mongo.connect()
  console.log("Connected correctly to server");
  db = mongo.db(dbName);
  collection = db.collection("symbols")
}

async function dbRetrieve() {
  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  console.log(`${prettyTime} - Retrieving data from database`)
  data = await collection.find().toArray();
  return data
}

function rankMovement(markets) {
  outputArray = []
  markets.forEach(market => {
    let marketName = `${market.asset}/${market.base}`
    ema1 = ema(market.history, 1, 'close')
    ema3 = ema(market.history, 3, 'close')
    outputArray.push({
      'market': marketName,
      'movement': ema1/ema3 - 1,
      'ema1': ema1,
      'ema3': ema3,
      'fetched': new Date(market.history[market.history.length-1].endTime - 59000).toLocaleString()
    })
  })
  return outputArray.sort((a, b) => a.movement - b.movement)
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