// Fetch market data and store it in Mongo database

require('dotenv').config();
const axios = require('axios')
const ccxt = require('ccxt');

const binance = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  // 'enableRateLimit': true,
});

const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@price-history.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
let db;
let collection;
let exchangeHistory;
let markets;
const dbName = "magic-money-tree";

async function drop() {
  await setupDB()
  await dbDrop(collection)
}

async function run() {
  await drop()
  await setupDB()
  await fetch()
  exchangeHistory = await collateData(exchangeHistory)
  await fillDatabase()
  run()
}

async function setupDB() {
  await mongo.connect()
  db = mongo.db(dbName);
  collection = db.collection("symbols")
  console.log("Set up database");
}

async function fetch() {
  console.log("Fetching summary")
  markets = await binance.load_markets()
  console.log("Filtering summary (for testing)")
  markets = Object.keys(markets).map(market => market = market.replace('/', ''))
  exchangeHistory = await fetchAllHistory(markets, '1m')
}

async function fetchAllHistory(markets, timeframe) {
  let h
  let allHistory = []
  let n = markets.length
  for (let i = 0; i < n; i++) {
    let sym = markets[i]
    try {
      console.log(`${i+1}/${n} Fetching price history for ${sym}`)
      h = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${sym}&interval=${timeframe}`)
      allHistory.push({
        symbol: sym,
        history: h.data
      })
    } catch(error) {
      console.log(error)
      markets.splice(i, 1)
      i--
      n--
    }
  }
  return allHistory
}

async function fillDatabase() {
  let n = markets.length
  for (let i = 0; i < n; i++) {
    market = markets[i]
    console.log(`${i+1}/${n} Adding price history for ${market}`)
    marketObject = {}
    marketObject['history'] = exchangeHistory.data[market].history
    marketObject['pair'] = market
    await dbInsert(marketObject)
  }
}


async function collateData(data) {
  let symbols = {
    data: {}
  }
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
    symbols['data'][symbol.symbol] = {
      'symbol': symbol.symbol,
      'history': periods
    }
  })
  return symbols
}

async function dbInsert(data) {
  const p = await collection.insertOne(data)
}

async function dbRetrieve() {
  console.log('Retrieving data from database')
  const data = await collection.find().toArray();
  return data
}

async function dbDrop(col) {
  const p = await col.drop()
}

run();
// let timer = setInterval(run, 1000)
