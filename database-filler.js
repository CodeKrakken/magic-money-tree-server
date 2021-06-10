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
let fetchTime;
const dbName = "magic-money-tree";

async function run() {
  await setupDB()
  await fetch()
  exchangeHistory = await collateData(exchangeHistory)
  await fillDatabase()
  // run()
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
  markets = Object.keys(markets).filter(market => market.includes('DOGE')).map(market => market = market.replace('/', ''))
  exchangeHistory = await fetchAllHistory(markets)
}

async function fetchAllHistory(markets) {
  let h
  let allHistory = []
  let n = markets.length
  for (let i = 0; i < n; i++) {
    let sym = markets[i]
    try {
      console.log(`${i+1}/${n} Fetching price history for ${sym}`)
      h = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${sym}&interval=1m`)
      let d = new Date();
      fetchTime = d.getTime()
      if (fetchTime - h.data[0][0] < 30000000) {
        allHistory.push({
          symbol: sym,
          history: h.data
        })
      } else {
        markets.splice(i, 1)
        i--
        n--
      }
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
  const query = { pair: data.pair };
  const options = {
    upsert: true,
  };
  const result = await collection.replaceOne(query, data, options);

}

run();
