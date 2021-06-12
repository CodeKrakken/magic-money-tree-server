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
let tallyObject = {
  assets: {
    unique: 0,
    total: 0
  },
  bases: {
    unique: 0,
    total: 0
  }
}
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
  markets = filterByVolume()
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
      if (symbols.includes(sym)) {
        response = await sufficientVolume(i)
        console.log(response)
        if (response === `  Adding price history for ${sym}`) {
          symbolObject = {
            history: h.data,
            symbol: sym
          }
          symbolObject = await collateData(symbolObject)
          await dbInsert(symbolObject)
        } else {
          symbols.splice(i, 1)
          markets.splice(i, 1)
          i--
          n--
        }
      }
    } catch (error) {
      console.log(error.message)
    }
  }
  fs.appendFile('coinpairs.txt', JSON.stringify(tallyObject), function(err) {
    if (err) return console.log(err);
  })
}

async function filterByVolume() {
  markets.forEach(market => {
    let response = await sufficientVolume(i)
  })
}

async function sufficientVolume(i) {
  let market = markets[i]
  let asset = market.substring(0, market.indexOf('/'))
  let base = market.substring(market.indexOf('/')+1)
  await tally(asset, base)
  let newMarket = `${asset}/USDT`
  let dollarSymbol = `${asset}USDT`
  if (markets.includes(newMarket)) {
    let twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${dollarSymbol}`)
    let dollarPrice = parseFloat(twentyFourHour.data.weightedAvgPrice)
    let totalVolume = parseFloat(twentyFourHour.data.volume)
    volumeDollarValue = totalVolume * dollarPrice
    if (volumeDollarValue < 50000000) { return "Insufficient market volume"}
  } else {
    fs.appendFile('missing-pairs.txt', dollarSymbol + '\n', function(err) {
      if (err) return console.log(err);
    })
    return 'No dollar comparison available'
  }

  return `  Adding price history for ${symbols[i]}`
}

async function tally(asset, base) {
  if (Object.keys(tallyObject.assets).includes(asset)) {
    tallyObject.assets[asset] ++
  } else {
    tallyObject.assets[asset] = 1
    tallyObject.assets.unique ++
  }
  if (Object.keys(tallyObject.bases).includes(base)) {
    tallyObject.bases[base] ++
  } else {
    tallyObject.bases[base] = 1
    tallyObject.bases.unique ++
  }
  tallyObject.assets.total ++
  tallyObject.bases.total ++
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
