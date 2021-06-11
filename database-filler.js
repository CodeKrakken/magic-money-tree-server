// Fetch market data and store it in Mongo database

require('dotenv').config();
const axios = require('axios')
const ccxt = require('ccxt');

const binance = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  // 'enableRateLimit': true,
});

const fs = require('fs');
const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@price-history.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
let db;
let collection;
let exchangeHistory;
let markets;
let symbols;
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
  markets = Object.keys(markets).filter(market => goodMarket(market))
  symbols = markets.map(market => market = market.replace('/', ''))
  exchangeHistory = await fetchAndInsert(symbols)
  fetch()
}

function goodMarket(market) {
  return markets[market].active
}

async function fetchAndInsert(symbols) {
  let h
  let n = symbols.length
  for (let i = 0; i < n; i++) {
    let sym = symbols[i]
    try {
      console.log(`Fetching price history for ${sym} ${i+1}/${n}`)
      h = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${sym}&interval=1m`)
    } catch(error) {
      symbols.splice(i, 1)
      markets.splice(i, 1)
      i--
      n--
    }
    try {
      if (symbols.includes(sym) && sufficientVolume(h.data, sym, i)) {
        console.log(`  Adding price history for ${sym}`)
        symbolObject = {
          history: h.data,
          symbol: sym
        }
        symbolObject = await collateData(symbolObject)
        await dbInsert(symbolObject)
      }
    } catch (error) {
      console.log(h.data.length)
    }
  }
}

async function sufficientVolume(data, sym, i) {
  let totalVolume = 0
  data.forEach(datum => {
    totalVolume += parseFloat(datum[5])
  })
  let market = markets[i]
  let asset = market.substring(0, market.indexOf('/'))
  let newMarket = `${asset}/USDT`
  let newSymbol = `${asset}USDT`
  if (markets.includes(newMarket)) {
    let dollarPriceRaw = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${newSymbol}`)
    let dollarPrice = dollarPriceRaw.data.price
    volumeDollarValue = totalVolume * dollarPrice
    console.log(volumeDollarValue)
  } else {
    fs.appendFile('missing-pairs.txt', newSymbol + '\n', function(err) {
      if (err) return console.log(err);
    })
  }
  
  // console.log(totalVolume)
  // console.log(sym)
  // console.log(asset)
  // console.log(base)
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
