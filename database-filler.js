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
 
async function mainProgram() {
  let markets = await getMarkets()
  await populateDatabase(markets)
  console.log('Restarting process')
  mainProgram()
}

async function quickMain() {
  let markets = [
    "ETH/BTC",
    "LTC/BTC",
    "BNB/BTC",
    "EOS/ETH",
    "BNB/ETH",
    "BTC/USDT",
    "ETH/USDT",
    "LINK/BTC",
    "LINK/ETH",
    "EOS/BTC",
    "ETC/ETH",
    "ETC/BTC",
    "XRP/BTC",
    "XRP/ETH",
    "BNB/USDT",
    "ADA/BTC",
    "ADA/ETH",
    "XLM/BTC",
    "XLM/ETH",
    "XLM/BNB",
    "LTC/ETH",
    "LTC/USDT",
    "LTC/BNB",
    "GTO/BTC",
    "GTO/ETH",
    "GTO/BNB",
    "ADA/USDT",
    "ADA/BNB",
    "XRP/USDT",
    "BTC/TUSD",
    "ETH/TUSD",
    "EOS/USDT",
    "EOS/BNB",
    "THETA/BTC",
    "THETA/ETH",
    "THETA/BNB",
    "XRP/BNB",
    "XLM/USDT",
    "DATA/BTC",
    "DATA/ETH",
    "ETC/USDT",
    "ETC/BNB",
    "VET/BTC",
    "VET/ETH",
    "VET/USDT",
    "VET/BNB",
    "USDC/BNB",
    "BNB/PAX",
    "BTC/PAX",
    "ETH/PAX",
    "XRP/PAX",
    "EOS/PAX",
    "XLM/PAX",
    "BNB/TUSD",
    "XRP/TUSD",
    "EOS/TUSD",
    "XLM/TUSD",
    "BNB/USDC",
    "BTC/USDC",
    "ETH/USDC",
    "XRP/USDC",
    "EOS/USDC",
    "XLM/USDC",
    "USDC/USDT",
    "ADA/TUSD",
    "USDC/TUSD",
    "USDC/PAX",
    "LINK/USDT",
    "LINK/TUSD",
    "LINK/PAX",
    "LINK/USDC",
    "LTC/TUSD",
    "LTC/PAX",
    "LTC/USDC",
    "BNB/USDS",
    "BTC/USDS",
    "ADA/PAX",
    "ADA/USDC",
    "THETA/USDT",
    "MATIC/BNB",
    "MATIC/BTC",
    "MATIC/USDT",
    "ETC/USDC",
    "ETC/PAX",
    "ETC/TUSD",
    "TFUEL/BNB",
    "TFUEL/BTC",
    "TFUEL/USDT",
    "TFUEL/USDC",
    "TFUEL/TUSD",
    "TFUEL/PAX",
    "GTO/USDT",
    "GTO/PAX",
    "GTO/TUSD",
    "GTO/USDC",
    "DOGE/BNB",
    "DOGE/BTC",
    "DOGE/USDT",
    "DOGE/PAX",
    "DOGE/USDC",
    "CHZ/BNB",
    "CHZ/BTC",
    "CHZ/USDT",
    "BNB/BUSD",
    "BTC/BUSD",
    "BUSD/USDT",
    "XRP/BUSD",
    "ETH/BUSD",
    "LTC/BUSD",
    "LINK/BUSD",
    "ETC/BUSD",
    "BUSD/NGN",
    "BNB/NGN",
    "BTC/NGN",
    "EOS/BUSD",
    "XLM/BUSD",
    "ADA/BUSD",
    "BTC/RUB",
    "ETH/RUB",
    "XRP/RUB",
    "BNB/RUB",
    "BUSD/RUB",
    "VET/BUSD",
    "BTC/TRY",
    "BNB/TRY",
    "BUSD/TRY",
    "ETH/TRY",
    "XRP/TRY",
    "BTC/EUR",
    "ETH/EUR",
    "BNB/EUR",
    "XRP/EUR",
    "EUR/BUSD",
    "EUR/USDT",
    "BTC/ZAR",
    "ETH/ZAR",
    "BNB/ZAR",
    "BUSD/ZAR",
    "BTC/BKRW",
    "ETH/BKRW",
    "BNB/BKRW",
    "DATA/BUSD",
    "DATA/USDT",
    "SOL/BNB",
    "SOL/BTC",
    "SOL/USDT",
    "SOL/BUSD",
    "BTC/IDRT",
    "BNB/IDRT",
    "BUSD/IDRT",
    "MATIC/BUSD",
    "BTC/GBP",
    "ETH/GBP",
    "XRP/GBP",
    "BNB/GBP",
    "BTC/UAH",
    "BTC/BIDR",
    "ETH/BIDR",
    "BNB/BIDR",
    "BUSD/BIDR",
    "DOGE/BUSD",
    "XRP/BKRW",
    "ADA/BKRW",
    "BTC/AUD",
    "ETH/AUD",
    "BUSD/BKRW",
    "XRP/AUD",
    "BNB/AUD",
    "BTC/DAI",
    "ETH/DAI",
    "BNB/DAI",
    "BUSD/DAI",
    "DOT/BNB",
    "DOT/BTC",
    "DOT/BUSD",
    "DOT/USDT",
    "ETH/NGN",
    "DOT/BIDR",
    "LINK/AUD",
    "KSM/BNB",
    "KSM/BTC",
    "KSM/BUSD",
    "KSM/USDT",
    "LINK/TRY",
    "LINK/BKRW",
    "CAKE/BNB",
    "CAKE/BUSD",
    "BTC/BRL",
    "DOT/BKRW",
    "FIL/BNB",
    "FIL/BTC",
    "FIL/BUSD",
    "FIL/USDT",
    "LINK/EUR",
    "ETH/BRL",
    "DOT/EUR",
    "BNB/BRL",
    "LTC/EUR",
    "ADA/EUR",
    "LTC/NGN",
    "BUSD/BRL",
    "XRP/BRL",
    "XRP/NGN",
    "LINK/BRL",
    "LINK/NGN",
    "LTC/RUB",
    "XLM/EUR",
    "BUSD/BVND",
    "CHZ/TRY",
    "XLM/TRY",
    "LINK/GBP",
    "EOS/EUR",
    "LTC/BRL",
    "USDC/BUSD",
    "DOGE/EUR",
    "DOGE/TRY",
    "DOGE/AUD",
    "DOGE/BRL",
    "DOT/NGN",
    "BTC/VAI",
    "BUSD/VAI",
    "DOGE/GBP",
    "DOT/TRY",
    "CAKE/BTC",
    "CAKE/USDT",
    "DOT/GBP",
    "ADA/TRY",
    "ADA/BRL",
    "ADA/GBP",
    "DOT/BRL",
    "ADA/AUD",
    "CHZ/BRL",
    "CHZ/BUSD",
    "CHZ/EUR",
    "CHZ/GBP",
    "ADA/RUB",
    "MATIC/EUR",
    "EOS/TRY",
    "LTC/GBP",
    "THETA/EUR",
    "BNB/UAH",
    "VET/EUR",
    "VET/GBP",
    "CAKE/GBP",
    "DOGE/RUB",
    "VET/TRY",
    "SHIB/USDT",
    "SHIB/BUSD",
    "ICP/BTC",
    "ICP/BNB",
    "ICP/BUSD",
    "ICP/USDT",
    "BTC/GYEN",
    "SHIB/EUR",
    "SHIB/RUB",
    "ETC/EUR",
    "ETC/BRL",
    "DOGE/BIDR",
    "ETH/UAH",
    "MATIC/BRL",
    "SOL/EUR",
    "SHIB/BRL",
    "ICP/EUR",
    "MATIC/GBP",
    "SHIB/TRY",
    "MATIC/BIDR",
    "MATIC/RUB",
    "THETA/BUSD",
    "ATA/BTC",
    "ATA/BNB",
    "ATA/BUSD",
    "ATA/USDT",
    "MATIC/TRY",
    "ETC/GBP",
    "SOL/GBP"
  ]
  await quickFill(markets);
}

async function quickFill(markets) {
  let n = markets.length
  let tallyObject = { assets: {}, bases: {} }
  for (let i = 0; i < n; i ++) {
    let market = markets[i]
    let asset = market.substring(0, market.indexOf('/'))
    let base = market.substring(market.indexOf('/')+1)
    tally(asset, base, tallyObject)
    let symbol = market.replace('/', '')
    console.log(`Fetching history for ${i+1}/${n} - ${symbol}`)
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
        'asset': asset,
        'base': base
      }
      symbolObject = await collateData(symbolObject)
      await dbInsert(symbolObject)
    }
  }
  fs.appendFile('coinpairs.txt', JSON.stringify(tallyObject), function(err) {
    if (err) return console.log(err);
  })
  quickFill(markets)
}

async function getMarkets() {
  console.log('Fetching overview\n')
  let markets = await binance.load_markets()
  console.log(Object.keys(markets).length)
  markets = markets.filter(market => market.active)
  console.log(Object.keys(markets).length)
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
  let outputObject = {
    'history': history,
    'asset': data.asset,
    'base': data.base,
    'symbol': data.asset + data.base
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

async function tally(asset, base, tallyObject) {
  try{
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
  } catch (error) {
    console.log(error.message)
  }
}

run();
// quickRun();
