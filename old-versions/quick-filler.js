// Fetch data for preselected coinpairs and store it in Mongo database

require('dotenv').config();
const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@price-history.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
const fs = require('fs');
let db;
let collection;
const dbName = "magic-money-tree";

const axios = require('axios')
const ccxt = require('ccxt');

const binance = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  // 'enableRateLimit': true,
});

async function quickRun() {
  console.log('Running');
  await setupDB();
  await quickMain();
}

async function setupDB() {
  console.log("Setting up database\n");
  await mongo.connect()
  db = mongo.db(dbName);
  collection = db.collection("symbols")
}

async function quickMain() {
  let markets = await fs.readFileSync('goodMarkets.txt', 'utf8').split('""');
  markets = markets.filter(market => market.includes('USDT'))
  await quickFill(markets);
}

async function quickFill(markets) {
  let n = markets.length
  let tallyObject = { 
    assets: { total: 0, unique: 0 }, 
    bases: { total: 0, unique: 0 } 
  }

  for (let i = 0; i < n; i ++) {
    let market = markets[i]
    let asset = market.substring(0, market.indexOf('/'))
    let base = market.substring(market.indexOf('/')+1)
    tally(asset, base, tallyObject)
    let symbol = market.replace('/', '')
    console.log(`Fetching history for ${i+1}/${n} - ${symbol}`)
    let history = await fetchHistory(symbol)
    if (history === "Fetch failed") {
      markets.splice(i, 1)
      i --
      n --
    } else {
      let symbolObject = {
        'history': history,
        'symbol': symbol,
        'asset': asset,
        'base': base
      }
      symbolObject = await collateData(symbolObject)
      await dbInsert(symbolObject)
    }
  }
  fs.appendFile('good market tally.txt', JSON.stringify(tallyObject), function(err) {
    if (err) return console.log(err);
  })
  quickFill(markets)
}

async function tally(asset, base, tallyObject) {
  try{
    if (Object.keys(tallyObject.assets).includes(asset)) {
      tallyObject.assets[asset].push(base)
    } else {
      tallyObject.assets[asset] = [base]
      tallyObject.assets.unique ++
    }
    if (Object.keys(tallyObject.bases).includes(base)) {
      tallyObject.bases[base].push(asset)
    } else {
      tallyObject.bases[base] = [asset]
      tallyObject.bases.unique ++
    }
    tallyObject.assets.total ++
    tallyObject.bases.total ++
  } catch (error) {
    console.log(error.message)
  }
}

async function fetchHistory(symbol) {
  try {
    let history = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbol}&interval=1m`)
    return history.data
  } catch (error) {
    return "Fetch failed"
  }
}

async function collateData(data) {
  console.log(`Collating history`)
  let history = []
  data.history.forEach(period => {
    history.push({
      'startTime': period[0],
      'open': period[1],
      'high': period[2],
      'low': period[3],
      'close': period[4],
      'endTime': period[6]
    })
  })
  let outputObject = {
    'history': history,
    'asset': data.asset,
    'base': data.base,
    'symbol': data.symbol
  }
  return outputObject
}

async function dbInsert(data) {
  console.log(`Adding to database\n`)
  const query = { symbol: data.symbol };
  const options = {
    upsert: true,
  };
  const result = await collection.replaceOne(query, data, options);
}

quickRun();