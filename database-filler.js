// Fetch market data and store it in Mongo database

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


async function run() {
  console.log('Running');
  await setupDB();
  await mainProgram();
}

async function setupDB() {
  console.log("Setting up database");
  await mongo.connect()
  db = mongo.db(dbName);
  collection = db.collection("symbols")
}
 
async function mainProgram() {
  let markets = await getMarkets()
  await populateDatabase(markets)
  console.log('Restarting process')
  mainProgram()
}

async function getMarkets() {
  console.log('Fetching overview\n')
  let markets = await binance.load_markets()
  return Object.keys(markets)
}

async function checkVolume(markets, i) {
  let market = markets[i]
  let asset = market.substring(0, market.indexOf('/'))
  let dollarMarket = `${asset}/USDT`
  if (markets.includes(dollarMarket)) {
    let dollarSymbol = dollarMarket.replace('/', '')
    let volumeDollarValue = await fetchDollarVolume(dollarSymbol)
    if (volumeDollarValue < 50000000) { return "Insufficient volume"} 
    if (volumeDollarValue === 'Invalid market') { return 'No dollar comparison available' }
  } else {
    return 'No dollar comparison available'
  }
  return 'Sufficient volume'
}

async function fetchDollarVolume(symbol) {
  try {
    let twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`)
  let dollarPrice = parseFloat(twentyFourHour.data.weightedAvgPrice)
  let totalVolume = parseFloat(twentyFourHour.data.volume)
  volumeDollarValue = totalVolume * dollarPrice
  return volumeDollarValue
  } catch (error) {
    return 'Invalid market'
  }
}

async function populateDatabase(markets) {
  let symbols = markets.map(market => market = market.replace('/', ''))
  let n = markets.length
  let goodMarkets = []
  for (let i = 0; i < n; i ++) {
    let symbol = symbols[i]
    console.log(`Checking 24 hour volume of market ${i+1}/${n} - ${symbol}`)
    let response = await checkVolume(markets, i)
    if (response === "Insufficient volume" || response === "No dollar comparison available") {
      markets.splice(i, 1)
      symbols.splice(i, 1)
      i--
      n--
      console.log(response + '\n')
    } else {
      console.log(`Sufficient volume - fetching price history`)
      let history = await fetchHistory(symbol)
      if (history === "Fetch failed") {
        console.log(history)
        markets.splice(i, 1)
        symbols.splice(i, 1)
        i --
        n --
      } else {
        let symbolObject = {
          'history': history,
          'symbol': symbol 
        }
        symbolObject = await collateData(symbolObject)
        await dbInsert(symbolObject)
        goodMarkets.push(symbolObject.symbol)
      }
    }
  }
  fs.appendFile('goodMarkets.txt', `${goodMarkets}`, function(err) {
    if (err) return console.log(err);
  })
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
  outputObject = {
    'symbol': data.symbol,
    'history': history
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

run();
