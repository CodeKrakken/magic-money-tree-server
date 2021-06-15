// Retrieves data from Mongo database
require('dotenv').config();

const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@price-history.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
const fee = 0.0075
const axios = require('axios')
const fs = require('fs');
const { format } = require('path');


let db;
let collection;
let exchangeHistory

const dbName = "magic-money-tree";

let wallet = {
  "USDT": 2000,
  "BTC": 0,
  "ETH": 0,
  "BNB": 0,
  "LTC": 0,
  "ADA": 0,
  "XRP": 0,
  "EOS": 0,
  "TRX": 0,
  "ETC": 0,
  "VET": 0,
  "BCH": 0,
  "USDC": 0,
  "LINK": 0,
  "THETA": 0,
  "MATIC": 0,
  "TFUEL": 0,
  "GTO": 0,
  "DOGE": 0,
  "CHZ": 0, 
  "BUSD": 0,
  "KAVA": 0,
  "EUR": 0,
  "DATA": 0,
  "SOL": 0,
  "BTCDOWN": 0,
  "SXP": 0,
  "DOT": 0,
  "KSM": 0,
  "RUNE": 0,
  "UNI": 0,
  "AAVE": 0,
  "FIL": 0,
  "1INCH": 0,
  "CAKE": 0,
  "SHIB": 0,
  "ICP": 0,
  "ATA": 0
}

async function run() {
  console.log('Running')
  // await setupDB()
  await mainProgram()
}

async function setupDB() {
  await mongo.connect()
  console.log("Connected correctly to server\n");
  db = mongo.db(dbName);
  collection = db.collection("symbols")
  console.log(`Retrieving data from database`)
}

async function mainProgram() {
  exchangeHistory = await dbRetrieve()
  let ema1
  let ema2
  let ema3
  rankedByMovement = await rankMovement(exchangeHistory)
  console.log(`Movement chart at ${timeNow()}\n`)
  display(rankedByMovement)
  let currentMarket = rankedByMovement[0].market
  await trade(currentMarket, wallet, ema1, ema2)
  mainProgram()
}

function timeNow() {
  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}


async function dbRetrieve() {
  // data = await collection.find().toArray();
  let markets = await fs.readFileSync('goodMarkets.txt', 'utf8').split('""');
  markets = markets.filter(market => market.includes('USDT'))
  let data = await fetch(markets);
  return data
}

async function fetch(markets){ 
  let n = markets.length
  let returnArray = []
  for (let i = 0; i < n; i ++) {
    let market = markets[i]
    let asset = market.substring(0, market.indexOf('/'))
    let base = market.substring(market.indexOf('/')+1)
    let symbol = market.replace('/', '')
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
      returnArray.push(symbolObject)
    }
  }
  return returnArray
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

function rankMovement(markets) {
  outputArray = []
  markets.forEach(market => {
    let marketName = `${market.asset}/${market.base}`
    ema1 = ema(market.history, 1, 'close')
    ema2 = ema(market.history, 1, 'close')
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

function display(rankedByMovement) {
  for (let i = 0; i < 10; i++) {
    let market = rankedByMovement[i]
    console.log(`${market.market} ... Movement: ${market.movement} ... (${market.fetched})`)
  }
  console.log('\n')
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

async function trade(currentMarket, wallet, ema1, ema2) {
  let currentAsset = currentMarket.substring(0, currentMarket.indexOf('/'))
  let currentBase = currentMarket.substring(currentMarket.indexOf('/')+1)
  let currentSymbol = currentMarket.replace('/', '')
  let currentPriceRaw = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${currentSymbol}`) 
  let currentPrice = parseFloat(currentPriceRaw.data.price)
  if (timeToBuy(wallet, currentPrice, ema1, currentAsset, currentBase)) {
    newBuyOrder(wallet, currentPrice, currentAsset, currentBase)
  } else if (timeToSell(wallet, currentPrice, ema1, ema2, currentAsset, currentBase)) {
    newSellOrder(wallet, currentPrice, currentAsset, currentBase)
  }
}

async function timeToBuy(wallet, currentPrice, ema1, currentAsset, currentBase) {
  return wallet[currentBase] > wallet[currentAsset] * currentPrice 
  && currentPrice > ema1
  && wallet[currentBase] > 0
}

async function newBuyOrder(wallet, currentPrice, currentAsset, currentBase) {
  let tradeReport
  try {
    let oldBaseVolume = wallet[currentBase]
    // await binanceClient.createMarketBuyOrder(market, oldBaseVolume / currentPrice)
    console.log(wallet)
    wallet[currentAsset] += oldBaseVolume * (1 - fee) / currentPrice
    wallet[currentBase] -= oldBaseVolume
    tradeReport = `${timeNow()} - Bought ${n(wallet[currentAsset], 8)} ${currentAsset} @ ${n(currentPrice, 8)} ($${oldBaseVolume})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })
  } catch(error) {
    console.log(error)
  }
  console.log(tradeReport)
  console.log(wallet)
}

async function timeToSell(wallet, currentPrice, ema1, ema2, currentAsset, currentBase) {
  return wallet[currentAsset] * currentPrice > wallet[currentBase] && ema1 < ema2
}

async function newSellOrder(wallet, currentPrice, currentAsset, currentBase) {
  let tradeReport
  try {
    const oldAssetVolume = wallet[currentAsset]
    // await binanceClient.createMarketSellOrder(market, oldAssetVolume)
    wallet[currentBase] += oldAssetVolume * currentPrice * (1 - fee)
    wallet[currentAsset] -= oldAssetVolume
    tradeReport = `${timeNow()} - Sold   ${n(oldAssetVolume, 8)} ${currentAsset} @ ${n(currentPrice, 8)} ($${oldAssetVolume * currentPrice})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })  
  } catch (error) {
    console.log(error.message)
  }
  console.log(tradeReport)
  console.log(wallet)
}

function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
}

run();