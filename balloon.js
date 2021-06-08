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
const dbName = "magic-money-tree";

const config = {
  asset: 'ETH',
  base: 'USDT',
  tickInterval: 1 * 2000,
  fee: 0.076
};

const market = `${config.asset}/${config.base}`
const symbol = `${config.asset}${config.base}`

async function run() {
  await setupDB()
  await fetch()
  let n = exchangeHistory.length
  for (let i = 0; i < n; i++) {
    await dbInsert(exchangeHistory[i])
  }  
  const data = await dbRetrieve()
  console.log(data)
}

async function setupDB() {
  await mongo.connect()
  console.log("Connected correctly to server");
  db = mongo.db(dbName);
  collection = db.collection("symbols")
}

async function fetch() {
  console.log("fetching markets")
  let markets = await binance.load_markets()
  // const markets = await binance.fetch_markets()
  console.log("filtering markets")
  markets = Object.keys(markets).filter(pair => (pair === market))
  console.log('getting exchange history')
  exchangeHistory = await fetchAllHistory(markets, '1m')
}

async function fetchAllHistory(markets, timeframe) {
  let allHistory = []
  let n = markets.length
  for (let i = 0; i < n; i++) {
    let symbol = markets[i].replace('/', '')
    try {
      console.log(`${i+1}/${n} Fetching price history for ${symbol}`)
      let history = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbol}&interval=${timeframe}`)
      allHistory.push({
        'pair': symbol,
        'prices': history.data
      })
    } catch(error) {
      console.log(error)
    }
  }
  return allHistory
}

async function dbInsert(data) {
  const p = await collection.insertOne(data)
}

async function dbRetrieve() {
  const data = await collection.findOne();
  return data
}

run();