// Retrieves data from Mongo database
require('dotenv').config();

const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@price-history.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
const config = {
  fee: 0.076
}
const axios = require('axios')
const fs = require('fs')


let db;
let collection;
let exchangeHistory
let ema1
let ema3

const dbName = "magic-money-tree";


async function run() {
  await setupDB()
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
  rankedByMovement = await rankMovement(exchangeHistory)
  let currentTime = Date.now()
  console.log(`Movement chart at ${timeNow()}\n`)
  display(rankedByMovement)
  let currentMarket = rankedByMovement[0].market
  let wallet = {
    'USDT': 2000,
    'currentAsset': '',
    'currentBase': 'USDT'
  }
  await trade(currentMarket, wallet)
  
  mainProgram()
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

async function trade(currentMarket, wallet) {
  wallet.currentAsset = currentMarket.substring(0, currentMarket.indexOf('/'))
  wallet.currentBase = currentMarket.substring(currentMarket.indexOf('/')+1)
  wallet[wallet.currentAsset] = 0
  let currentSymbol = currentMarket.replace('/', '')
  console.log(`Current Market: ${currentMarket}\n`)
  console.log(wallet)
  newBuyOrder(currentSymbol, wallet)
}

async function newBuyOrder(symbol, wallet) {
  let tradeReport
  try {
    let currentPriceRaw = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`) 
    let currentPrice = parseFloat(currentPriceRaw.data.price)
    let oldBaseVolume = wallet[wallet.currentBase]
    // await binanceClient.createMarketBuyOrder(market, oldBaseVolume / currentPrice)
    wallet[wallet.currentAsset] += oldBaseVolume * (1 - config.fee) / currentPrice
    wallet[wallet.currentBase] -= oldBaseVolume
    // buyCountdown = 10
    console.log(wallet[wallet.currentAsset])
    tradeReport = `${timeNow()} - Bought ${n(wallet[wallet.currentAsset], 8)} ${wallet.currentAsset} @ ${n(currentPrice, 8)} ($${oldBaseVolume})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })  
  } catch(error) {
    console.log(error)
  }
  console.log(tradeReport)
}

function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
}

run();