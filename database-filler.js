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

async function run() {
  await setupDB()
  await fetch()
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
  markets = Object.keys(markets).filter(market => goodMarket(market)).map(market => market = market.replace('/', ''))
  exchangeHistory = await fetchAndInsert(markets)
  fetch()
}

function goodMarket(market) {
  return markets[market].active
}

async function fetchAndInsert(markets) {
  let h
  let n = markets.length
  for (let i = 0; i < n; i++) {
    let sym = markets[i]
    try {
      console.log(`Fetching price history for ${sym} ${i+1}/${n}`)
      h = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${sym}&interval=1m`)
    } catch(error) {
      markets.splice(i, 1)
      i--
      n--
    }
    if (markets.includes(sym) && h.data[499][5] > 100) {
      console.log(`  Adding price history for ${sym}`)
      marketObject = {
        history: h.data,
        symbol: sym
      }
      marketObject = await collateData(marketObject)
      await dbInsert(marketObject)
    } else {
      markets.splice(i, 1)
      i--
      n--
    }
  }
}

async function collateData(data) {
  let periods = []
  data.history.forEach(period => {
    periods.push({
      'startTime': period[0],
      'open': period[1],
      'high': period[2],
      'low': period[3],
      'close': period[4],
      'volume': period[5],
      'endTime': period[6]
    })
  })
  outputObject = {
    'pair': data.symbol,
    'history': periods
  }
  return outputObject
}

async function dbInsert(data) {
  const query = { pair: data.pair };
  const options = {
    upsert: true,
  };
  const result = await collection.replaceOne(query, data, options);

}

run();
