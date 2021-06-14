// Retrieves data from Mongo database
require('dotenv').config();

const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@price-history.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
const config = {
  fee: 0.0075
}
const axios = require('axios')
const fs = require('fs')


let db;
let collection;
let exchangeHistory

const dbName = "magic-money-tree";


async function run() {
  await setupDB()
  let wallet = {
    'USDT': 2000,
    'currentAsset': '',
    'currentBase': 'USDT'
  }
  await mainProgram(wallet)
}

async function setupDB() {
  await mongo.connect()
  console.log("Connected correctly to server\n");
  db = mongo.db(dbName);
  collection = db.collection("symbols")
  console.log(`Retrieving data from database`)
}

async function mainProgram(wallet) {
  exchangeHistory = await dbRetrieve()
  let ema1
  let ema2
  let ema3
  rankedByMovement = await rankMovement(exchangeHistory)
  let currentTime = Date.now()
  console.log(`Movement chart at ${timeNow()}\n`)
  display(rankedByMovement)
  let currentMarket = rankedByMovement[0].market
  await trade(currentMarket, wallet, ema1, ema2)
  
  mainProgram(wallet)
}

function timeNow() {
  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}


async function dbRetrieve() {
  data = await collection.find().toArray();
  return data
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
  wallet.currentAsset = currentMarket.substring(0, currentMarket.indexOf('/'))
  wallet.currentBase = currentMarket.substring(currentMarket.indexOf('/')+1)
  wallet[wallet.currentAsset] = 0
  let currentSymbol = currentMarket.replace('/', '')
  let currentPriceRaw = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${currentSymbol}`) 
  let currentPrice = parseFloat(currentPriceRaw.data.price)
  if (timeToBuy(wallet, currentPrice, ema1)) {
    newBuyOrder(wallet, currentPrice)
  } else if (timeToSell(wallet, currentPrice, ema1, ema2)) {
    newSellOrder(wallet, currentPrice)
  }
}

async function timeToBuy(wallet, currentPrice) {
  return wallet[wallet.currentBase] > wallet[wallet.currentAsset] * currentPrice && currentPrice > ema1
}

async function newBuyOrder(wallet, currentPrice) {
  let tradeReport
  try {
    let oldBaseVolume = wallet[wallet.currentBase]
    // await binanceClient.createMarketBuyOrder(market, oldBaseVolume / currentPrice)
    console.log(wallet)
    wallet[wallet.currentAsset] += oldBaseVolume * (1 - config.fee) / currentPrice
    wallet[wallet.currentBase] -= oldBaseVolume
    tradeReport = `${timeNow()} - Bought ${n(wallet[wallet.currentAsset], 8)} ${wallet.currentAsset} @ ${n(currentPrice, 8)} ($${oldBaseVolume})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })
  } catch(error) {
    console.log(error)
  }
  console.log(tradeReport)
  console.log(wallet)
}

async function timeToSell(wallet, currentPrice, ema1, ema2) {
  return wallet[wallet.currentAsset] * currentPrice > wallet[wallet.currentBase] && ema1 < ema2
}

async function newSellOrder(wallet, currentPrice) {
  let tradeReport
  try {
    const oldAssetVolume = wallet[wallet.currentAsset]
    // await binanceClient.createMarketSellOrder(market, oldAssetVolume)
    wallet[wallet.currentBase] += oldAssetVolume * currentPrice * (1 - config.fee)
    wallet[wallet.currentAsset] -= oldAssetVolume
    tradeReport = `${timeNow()} - Sold   ${n(oldAssetVolume, 8)} ${wallet.currentAsset} @ ${n(currentPrice, 8)} ($${oldAssetVolume * currentPrice})\n`
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