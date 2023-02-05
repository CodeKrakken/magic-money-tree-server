require('dotenv').config();
const fs = require('fs');
const ccxt = require('ccxt');
const axios = require('axios')

const { MongoClient } = require('mongodb');
const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const uri = `mongodb+srv://${username}:${password}@cluster0.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
let db
let collection
const dbName = "magic-money-tree";

const minimumDollarVolume = 28000000
const fee = 0.001
const stopLossThreshold = 0.78

const binance = new ccxt.binance({

  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,

});

async function run() {

  try {
    
    await record(`\n ---------- \n\n\nRunning at ${timeNow()}\n`)
    await setupDB();
    const wallet = simulatedWallet()
    const allMarkets = await fetchMarkets()
    const goodMarketNames = Object.keys(allMarkets).filter(marketName => isGoodMarketName(marketName, allMarkets))
    console.log('\nValid Markets\n')
    goodMarketNames.map(name => console.log(name))

    if (goodMarketNames.length) {
      tick(wallet, goodMarketNames)
    }

  } catch (error) {
    console.log(error.message)
  }


}

function record(report) {
  fs.appendFile(`server-trade-history.txt`, report, function(err) {
    if (err) return console.log(err);
  })
}

function timeNow() {

  const currentTime = Date.now()
  const prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}

async function setupDB() {
  console.log('\nSetting up database ...')
  await mongo.connect()
  db = mongo.db(dbName);
  collection = db.collection("price-data")
  console.log("Database setup complete")
}

function simulatedWallet() {

  return {
    currencies: {
      USDT: {
        'quantity': 1000,
        'dollarValue': 1000
      }
    }
  }
}

async function fetchMarkets() {
  try {
    const markets = await binance.load_markets()
    return markets
  } catch (error) {
    console.log(error.message)
  }
  
}

function isGoodMarketName(marketName, markets) {

  return markets[marketName].active
  && marketName.includes('/USDT') 
  && !marketName.includes('UP') 
  && !marketName.includes('DOWN') 
  && !marketName.includes('BUSD')
  && !marketName.includes('TUSD')
  && !marketName.includes('USDC')
  // && marketName === 'GBP/USDT'
  // && !marketName.includes('BNB')

}

async function tick(wallet, goodMarketNames, currentMarket=null) {

  try {
    console.log(`\n\n----- Tick at ${timeNow()} -----\n\n`)
    await refreshWallet(wallet)
    displayWallet(wallet)
    let activeCurrency = await getActiveCurrency(wallet)
    const viableMarketNames = await getViableMarketNames(goodMarketNames)
    console.log('\nViable Markets\n')
    viableMarketNames.map(name => console.log(name))
    let viableMarkets = await fetchAllHistory(viableMarketNames)
    viableMarkets = await addEMA(viableMarkets)
    await displayMarkets(viableMarkets)
    
    // TRADE
    
    if (activeCurrency === 'USDT') {

      currentMarket = null
      wallet.data = { targetPrice: null }

      const response = getTargetMarket(viableMarkets)
      console.log(`\n${response !== 'No bullish markets' ? 'Target market - ' : ''}${response}`)

      // if (response !== 'No bullish markets' && wallet.currencies[activeCurrency].quantity > 10) {
        const targetMarket = response
        await simulatedBuyOrder(wallet, targetMarket, goodMarketNames)
      // }
    }
  } catch (error) {
    console.log(error)
  }
  tick(wallet, goodMarketNames, currentMarket)
}

async function refreshWallet(wallet) {

  const n = Object.keys(wallet.currencies).length

  for (let i = 0; i < n; i ++) {
    const currency = Object.keys(wallet.currencies)[i]
    wallet.currencies[currency].dollarPrice = currency === 'USDT' ? 1 : await fetchPrice(`${currency}USDT`)
    wallet.currencies[currency].dollarValue = wallet.currencies[currency].quantity * wallet.currencies[currency].dollarPrice
  }
  return wallet
}


async function fetchPrice(marketName) {

  try {

    const symbolName = marketName.replace('/', '')
    console.log(`Fetching price for ${symbolName}`)

    const rawPrice = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolName}`) 
    const price = parseFloat(rawPrice.data.price)
    return price

  } catch (error) {

    console.log(error.message)
  }
}

function displayWallet(wallet) {

  console.log('Wallet')
  Object.keys(wallet.currencies).map(currencyName => {
    console.log(`${wallet.currencies[currencyName].quantity} ${currencyName} @ ${wallet.currencies[currencyName].dollarPrice} = $${wallet.currencies[currencyName].dollarValue}`)
  })
  console.log(`Total: $${getDollarTotal(wallet)}`)
}

function getDollarTotal(wallet) {
  let total = 0
  Object.keys(wallet.currencies).map(currencyName => {
    total += wallet.currencies[currencyName].dollarValue
  })
  return total
}

async function getViableMarketNames(marketNames) {
  console.log('\nFinding viable markets ... \n')
  const viableMarketNames = []
  const symbolNames = marketNames.map(marketName => marketName = marketName.replace('/', ''))
  const n = symbolNames.length

  for (let i = 0; i < n; i++) {

    const symbolName  = symbolNames[i]
    const marketName  = marketNames[i]

    console.log(`Checking volume of ${marketName}`)

    const response    = await checkVolume(symbolName)

    if (!response.includes("Insufficient") && response !== "No response") {
    
      viableMarketNames.push(marketName)
    } else {
      console.log(response)
    }
  }

  return viableMarketNames

}

async function checkVolume(symbolName) {

  const twentyFourHour = await fetch24Hour(symbolName)
  
  if (twentyFourHour.data !== undefined) {

    return `${twentyFourHour.data.quoteVolume < minimumDollarVolume ? 'Ins' : 'S'}ufficient volume.`
  
  } else {

    return "No response"
  }
}

async function fetch24Hour(symbolName) {
  try {

    const twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolName}`, { timeout: 10000 })
    return twentyFourHour

  } catch (error) {

    return 'Invalid market'
  }
}

async function fetchAllHistory(marketNames) {

  console.log('\nFetching history ...\n')
  const n = marketNames.length
  const returnArray = []

  for (let i = 0; i < n; i++) {

    try {

      const marketName = marketNames[i]
      const symbolName = marketName.replace('/', '')
      const response = await fetchSingleHistory(symbolName)

      let symbolObject

      if (response !== 'No response') {

        let symbolObject = await annotateData({
          name      : marketName,
          histories : response
        })

        returnArray.push(symbolObject)
      } else { 
        console.log(response)
      }


    } catch (error) {
      console.log(error.message)
    }
  }

  return returnArray
}

async function fetchSingleHistory(symbolName) {

  console.log(`Fetching history for ${symbolName} ...`)

  try {
    
    let minuteHistory = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1m`, { timeout: 10000 })
    let hourHistory   = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1h`, { timeout: 10000 })
    let dayHistory    = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1d`, { timeout: 10000 })
    
    return {
      minutes : minuteHistory.data, 
      hours   : hourHistory.data, 
      days    : dayHistory.data
    }

  } catch (error) {
    
    return 'No response'

  }
}

async function annotateData(data) {

  try {

    const histories = {}

    Object.keys(data.histories).map(periods => {

      const history = []

      data.histories[periods].map(period => {
  
        const average = (
  
          parseFloat(period[1]) +
          parseFloat(period[2]) +
          parseFloat(period[3]) +
          parseFloat(period[4])
  
        )/4
  
        history.push(
          {
            'startTime': period[0],
            'open'     : parseFloat(period[1]),
            'high'     : parseFloat(period[2]),
            'low'      : parseFloat(period[3]),
            'close'    : parseFloat(period[4]),
            'endTime'  : period[6],
            'average'  : average
          }
        )
      })
      histories[periods] = history
    })

    return {
      name: data.name,
      histories: histories
    }
  
  } catch(error) {

    console.log(error.message)

  }
}

async function addEMA(markets) {

  try {

    markets.map(market => {
      market.emas = {
        days: {
          ema13   : ema(market.histories.days,  13,  'close'),
          ema34   : ema(market.histories.days,  34,  'close'),
          ema89   : ema(market.histories.days,  89,  'close'),
          ema233  : ema(market.histories.days, 233,  'close')
        }, 
        hours: {
          ema13   : ema(market.histories.hours,  13,  'close'),
          ema34   : ema(market.histories.hours,  34,  'close'),
          ema89   : ema(market.histories.hours,  89,  'close'),
          ema233  : ema(market.histories.hours, 233,  'close')
        }, 
        minutes: {
          ema13   : ema(market.histories.minutes,   13, 'close'),
          ema34   : ema(market.histories.minutes,   34, 'close'),
          ema89   : ema(market.histories.minutes,   89, 'close'),
          ema233  : ema(market.histories.minutes,  233, 'close')
        }
      }
    })

    return markets

  } catch (error) {

    console.log(error.message)

  }
}

function ema(rawData, time, parameter) {
  
  const data = extractData(rawData, parameter)
  const k = 2/(time + 1)
  const emaData = []
  emaData[0] = data[0]

  for (let i = 1; i < data.length; i++) {

    const newPoint = (data[i] * k) + (emaData[i-1] * (1-k))
    emaData.push(newPoint)

  }

  const currentEma = [...emaData].pop()
  return +currentEma

}

function extractData(dataArray, key) {
  const outputArray = []
  dataArray.map(obj => {
    outputArray.push(obj[key])
  })

  return outputArray

}

function displayMarkets(markets) {
  console.log('\nMarkets\n')
  markets.map(market => {console.log(`${market.name} ...`)})
}

// TRADE FUNCTIONS

function getTargetMarket(markets) {

  const bulls = markets.filter(market => 
    // market.shape > 0 
    // && 
    // market.trend === 'up'
    // && 
    market.ema1 > market.ema233
  ).sort((a, b) => a.ema1/a.ema233 - b.ema1/b.ema233)

  return bulls.length ? bulls[0] : 'No bullish markets'
}

async function getActiveCurrency(wallet) {

  let n = Object.keys(wallet.currencies).length

  for (let i = 0; i < n; i ++) {
    const currencyName = Object.keys(wallet.currencies)[i]
    
    if (currencyName === 'USDT') {

      wallet.currencies[currencyName].dollarPrice = 1
      
    } else {

      wallet.currencies[currencyName].dollarSymbol = `${currencyName}USDT`
      wallet.currencies[currencyName].dollarPrice = await fetchPrice(wallet.currencies[currencyName].dollarSymbol)
    }

    wallet.currencies[currencyName].dollarValue = wallet.currencies[currencyName].quantity * wallet.currencies[currencyName].dollarPrice

  }

  let sorted = Object.keys(wallet.currencies).sort((a, b) => wallet.currencies[a].dollarValue - wallet.currencies[b].dollarValue)
  return sorted.pop()
}

async function simulatedBuyOrder(wallet, market, goodMarketNames) {
  try {
    const asset = market.name.split('/')[0]
    const base  = market.name.split('/')[1]
    const response = await fetchPrice(`${asset}${base}`)

    if (response === 'No response') {

      console.log(`\nNo response - starting new tick`)
      tick(wallet, goodMarketNames)

    } else {

      const currentPrice = response
      const baseVolume = wallet.currencies[base].quantity
      if (!wallet.currencies[asset]) wallet.currencies[asset] = { quantity: 0 }
      const volumeToTrade = baseVolume * (1 - fee)
      wallet.currencies[base].quantity -= volumeToTrade
      wallet.currencies[asset].quantity += volumeToTrade * (1 - fee) / currentPrice
      const targetVolume = baseVolume * (1 + (2 * fee))
      wallet.data.targetPrice = targetVolume / wallet.currencies[asset].quantity
      wallet.data.boughtPrice = currentPrice
      wallet.data.stopLossPrice = wallet.data.boughtPrice * stopLossThreshold
      wallet.data.highPrice = currentPrice
      process.env.TARGET_PRICE = targetVolume / wallet.currencies[asset].quantity
      process.env.BOUGHT_PRICE = currentPrice
      process.env.STOP_LOSS_PRICE = wallet.data.boughtPrice * stopLossThreshold
      process.env.HIGH_PRICE = currentPrice
      await dbInsert({targetPrice: wallet.data.targetPrice})
      await dbInsert({boughtPrice: wallet.data.boughtPrice})
      await dbInsert({stopLossPrice: wallet.data.stopLossPrice})
      await dbInsert({highPrice: wallet.data.highPrice})
      wallet.data.boughtTime = Date.now()
      const tradeReport = `${timeNow()} - Transaction - Bought ${wallet.currencies[asset].quantity} ${asset} @ ${currentPrice} ($${baseVolume * (1 - fee)})\nTarget Price - ${wallet.data.targetPrice}\n\n`
      console.log(tradeReport)
      await record(tradeReport)
    }
  } catch (error) {
    console.log(error.message)
  }
}

async function dbInsert(data) {

  const query   = { key: data.key };
  const options = { upsert: true };
  result = await collection.replaceOne(query, data, options);
  return result
}

run()