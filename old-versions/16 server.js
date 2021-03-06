require('dotenv').config();
const axios = require('axios')
const axiosRetry = require('axios-retry')
const fs = require('fs');
const ccxt = require('ccxt');
const express = require('express');
const app = express();
const port = process.env.PORT || 8001;

const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${username}:${password}@cluster0.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let db
let collection
const dbName = "magic-money-tree";

// Setup

const retryDelay = (retryNumber = 0) => {

  const seconds = Math.pow(2, retryNumber) * 1000;
  const randomMs = 1000 * Math.random();
  return seconds + randomMs;

};



axiosRetry(axios, {

  retries: Infinity,
  retryDelay,
  // retry on Network Error & 5xx responses
  retryCondition: axiosRetry.isRetryableError,

});



module.exports = axios;



const binance = new ccxt.binance({

  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,

});



// Config

const minimumDollarVolume = 28000000
const fee = 0.001
const stopLossThreshold = 0.78 // 0.78442806076854334227

// Functions

async function run() {

  await record(`\n ---------- \n\n\nRunning at ${timeNow()}\n\n`)
  await setupDB();
  // let wallet = simulatedWallet()
  let allMarkets = await fetchMarkets()
  let goodMarketNames = Object.keys(allMarkets).filter(marketName => goodMarketName(marketName, allMarkets))

  let wallet = {

    'currencies': {}
  
  }

  let currentMarket

  tick(wallet, goodMarketNames, currentMarket)

}



function record(report) {

  fs.appendFile(`server-trade-history.txt`, report, function(err) {
    if (err) return console.log(err);
  })

  console.log(report)

}



async function setupDB() {
  await mongo.connect()
  db = mongo.db(dbName);
  collection = db.collection("price-data")
  // console.log("Database setup complete")
}



function simulatedWallet() {

  return { 
  
    currencies: {
      'USDT': {
        'quantity': 1000,
        'dollarValue': 1000
      }
    }
  }
}



async function liveWallet(wallet, goodMarketNames, currentMarket) {

  wallet['currencies'] = {}

  let balancesRaw = await binance.fetchBalance()

  if (balancesRaw !== undefined) {

    let currencyArray = Object.keys(balancesRaw.free)
    let n = currencyArray.length

    for (let i = 0; i < n; i ++) {

      let currency = currencyArray[i]
      let dollarMarket = `${currency}/USDT`
  
      if (
        balancesRaw.free[currency] > 0 && 
        (currency === 'USDT' || goodMarketNames.includes(dollarMarket))
      ) {

        wallet['currencies'][currency] = { 'quantity': balancesRaw.free[currency] }
      }
    }
    return wallet

  } else {

    tick(wallet, goodMarketNames, currentMarket)

  }
}



function timeNow() {

  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}



async function fetchMarkets() {

  let markets = await binance.load_markets()
  return markets
}



async function tick(wallet, goodMarketNames, currentMarket) {

  try {
    wallet = await liveWallet(wallet, goodMarketNames, currentMarket)
    console.log(`\n\n----- Tick at ${timeNow()} -----\n\n`)
    let activeCurrency = await getActiveCurrency(wallet)

    if (activeCurrency === 'USDT') { 

      currentMarket = undefined
      wallet.targetPrice = undefined

    } else {

      currentMarket = { name: `${activeCurrency}/USDT` }
      let data = await collection.find().toArray();

      if (wallet.targetPrice === undefined && data[0] !== undefined) {
        wallet.targetPrice = data[0].targetPrice
      }

      if (wallet.stopLossPrice === undefined && data[0] !== undefined) {
        wallet.stopLossPrice = data[0].stopLossPrice
      }
    }

    await refreshWallet(wallet, activeCurrency, goodMarketNames, currentMarket)
    console.log('\n')
    // console.log(`Fetching overview`)
    let viableMarketNames = await getViableMarketNames(goodMarketNames)
    
    if (currentMarket !== undefined && !viableMarketNames.includes(currentMarket.name)) {
    
      viableMarketNames.push(currentMarket.name)
      // console.log('Current market not viable - manually added')
    }

    let viableMarkets

    if (currentMarket !== undefined) {

      viableMarkets = await fetchAllHistory(viableMarketNames, currentMarket.name) 

    } else {

      viableMarkets = await fetchAllHistory(viableMarketNames)

    }

    if (viableMarkets.includes('No response for current market')) {

      viableMarkets.pop()
      return tick(wallet, goodMarketNames, currentMarket)
    }

    viableMarkets = await sortByArc(viableMarkets)
    viableMarkets = await addEMA(viableMarkets)

    if (currentMarket !== undefined) {

      let currentMarketArray = viableMarkets.filter(market => market.name === currentMarket.name)
      currentMarket = currentMarketArray[0]
      let newStopLoss = currentMarket.bigDrop * currentMarket.history[currentMarket.history.length-1].straightLine
      currentMarket.currentPrice = await fetchPrice(currentMarket.name)
      if (newStopLoss > wallet.stopLossPrice && currentMarket.currentPrice > wallet.targetPrice) {

        wallet.stopLossPrice = newStopLoss
        await dbInsert({'targetPrice': wallet.targetPrice, 'stopLossPrice': wallet.stopLossPrice})

      }
    }
    await displayMarkets(viableMarkets, currentMarket)
    let bulls = getBulls(viableMarkets)

    console.log('\n')
    let bestMarket = bulls[0]
    let bullNames = []
    bulls.forEach(bull => { bullNames.push(bull.name) })

    if (activeCurrency === 'USDT') {

      if (bulls.length === 0) {

        // console.log('No bullish markets\n')
      
      } else {

        if (wallet.currencies[activeCurrency]['quantity'] > 10) {

          await liveBuyOrder(wallet, bestMarket, goodMarketNames, currentMarket)

        }
      }
    } else {
  
      try {
    
        if (currentMarket.currentPrice !== undefined && currentMarket.name !== bestMarket.name && currentMarket.currentPrice > wallet.targetPrice ) { 

          // console.log('Current Price:  ' + currentMarket.currentPrice)
          // console.log('Target Price:   ' + wallet.targetPrice)
          // console.log('Current Market: ' + currentMarket.name)
          // console.log('Next market:    ' + bestMarket.name)

          await liveSellOrder(wallet, currentMarket, 'Target price reached - switching market', goodMarketNames, currentMarket.currentPrice)
          await switchMarket(wallet, bestMarket, goodMarketNames, currentMarket, activeCurrency)
        } else

        if ((wallet.targetPrice === undefined || wallet.stopLossPrice === undefined) && activeCurrency !== 'USDT') {

          // console.log('Target Price:  ' + wallet.targetPrice)
          // console.log('Stop Loss Price:  ' + wallet.stopLossPrice)

          await liveSellOrder(wallet, currentMarket, 'Price information undefined', goodMarketNames, currentMarket.currentPrice)
        } else

        if (currentMarket.currentPrice < wallet.stopLossPrice) {

          // console.log('Target Price:  ' + wallet.targetPrice)
          // console.log('Stop Loss Price:  ' + wallet.stopLossPrice)

          await liveSellOrder(wallet, currentMarket, 'Below Stop Loss', goodMarketNames, currentMarket.currentPrice)
        }

      } catch(error) {

        console.log(error)
      }
    }
    tick(wallet, goodMarketNames, currentMarket)

  } catch (error) {

    console.log(error)
    tick(wallet, goodMarketNames, currentMarket)
  }
  
}



async function switchMarket(wallet, market, goodMarketNames, currentMarket, activeCurrency) {

  try {

    wallet = await liveWallet(wallet, goodMarketNames, currentMarket)
    activeCurrency = await getActiveCurrency(wallet)

    if (wallet.currencies[activeCurrency]['quantity'] > 10) {

      await liveBuyOrder(wallet, market, goodMarketNames, currentMarket)

    } else {

      switchMarket(wallet, market, goodMarketNames, currentMarket, activeCurrency)
    }  

  } catch (error) {

    console.log(error.message)
  }
}



async function getActiveCurrency(wallet) {

  let keys = Object.keys(wallet.currencies)
  let n = keys.length

  for (let i = 0; i < n; i ++) {
    
    let key = wallet.currencies[keys[i]]
    if (keys[i] === 'USDT') {

      key['dollarPrice'] = 1
      
    } else {

      key['dollarSymbol'] = `${keys[i]}USDT`
      key['dollarPrice'] = await fetchPrice(key['dollarSymbol'])
    }

    key['dollarValue'] = key['quantity'] * key['dollarPrice']

  }

  let sorted = Object.entries(wallet.currencies).sort((prev, next) => prev[1]['dollarValue'] - next[1]['dollarValue'])
  return sorted.pop()[0]
}



async function refreshWallet(wallet, activeCurrency, goodMarketNames, currentMarket) {

  let nonZeroWallet = Object.keys(wallet.currencies).filter(currency => wallet.currencies[currency]['quantity'] > 0)
  // console.log('Wallet')

  if (activeCurrency !== 'USDT') {

    let dollarSymbol = `${activeCurrency}USDT`
    let currentPrice = await fetchPrice(dollarSymbol)
    
    if (currentPrice === 'No response') {

      // console.log('Currency information unavailable  - starting new tick')
      tick(wallet, goodMarketNames, currentMarket)
    
    }
    
  }

  let dollarTotal = 0
  
  let n = nonZeroWallet.length

  for (let i = 0; i < n; i++) {

    let currency = nonZeroWallet[i]
    let dollarMarket = `${currency}/USDT`
    let dollarVolume
    let dollarPrice

    if (currency === 'USDT') {

      dollarVolume = wallet.currencies[currency]['quantity']
      wallet.currencies[currency]['price'] = 1

    } else {

      dollarPrice = await fetchPrice(dollarMarket)
      wallet.currencies[currency]['price'] = dollarPrice
      dollarVolume = wallet.currencies[currency]['quantity'] * wallet.currencies[currency]['price']
    }

    dollarTotal += dollarVolume

    if (currency === activeCurrency) {

      console.log(`${wallet.currencies[currency]['quantity']} ${currency} @ ${wallet.currencies[currency]['price']} = $${dollarVolume}`)
    }

    if (currency === activeCurrency && currency !== 'USDT') {

      console.log('\n')
      console.log(`Target Price - ${wallet.targetPrice} | Stop Loss Price - ${wallet.stopLossPrice}`)
      console.log('\n')
    }
  }
  console.log(`Total: $${dollarTotal}`)
}



async function dbInsert(data) {

  const query = { key: data.key };
  const options = {
    upsert: true,
  };
  result = await collection.replaceOne(query, data, options);
  return result
}



function goodMarketName(marketName, markets) {

  return markets[marketName].active
  && marketName.includes('USDT') 
  && !marketName.includes('USDT/')
  && !marketName.includes('UP') 
  && !marketName.includes('DOWN') 
  && !marketName.includes('BUSD')
  && !marketName.includes('TUSD')
  && !marketName.includes('USDC')
  && !marketName.includes('BNB')

}



async function getViableMarketNames(marketNames) {

  let voluminousMarketNames = []
  let symbolNames = marketNames.map(marketName => marketName = marketName.replace('/', ''))
  let n = symbolNames.length

  for (let i = 0; i < n; i++) {

    let symbolName = symbolNames[i]
    let marketName = marketNames[i]
    let response = await checkVolumeAndMovement(symbolName)

    if (!response.includes("Insufficient") && response !== "No response") {
    
      voluminousMarketNames.push(marketName)
    }
  }

  console.log('\n')
  return voluminousMarketNames

}



async function checkVolumeAndMovement(symbolName) {

  let twentyFourHour = await fetch24Hour(symbolName)
  
  if (twentyFourHour.data !== undefined) {

    if (twentyFourHour.data.quoteVolume < minimumDollarVolume) { return "Insufficient volume" }
    return 'Sufficient volume'
  
  } else {

    return "No response"
  }
}



async function fetch24Hour(symbolName) {

  try {

    let twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolName}`, { timeout: 10000 })
    return twentyFourHour

  } catch (error) {

    return 'Invalid market'
  }
}



async function fetchAllHistory(marketNames, currentMarketName) {

  // console.log('Fetching history\n')
  let n = marketNames.length
  let returnArray = []

  for (let i = 0; i < n; i ++) {

    try {

      let marketName = marketNames[i]
      let symbolName = marketName.replace('/', '')
      let response = await fetchOneHistory(symbolName)

      if (response === 'No response' && marketName === currentMarketName) { 

        // console.log(`No response for current market`)
        markets.push(`No response for current market`)
        return markets

      } else {

        let symbolHistory = response

        let symbolObject = {
  
          'history': symbolHistory,
          'name': marketName
  
        }
  
        symbolObject = await annotateData(symbolObject)
        await returnArray.push(symbolObject)

      }

    } catch (error) {
      console.log(error.message)
    }
  }

  console.log('\n')
  return returnArray

}



async function fetchOneHistory(symbolName) {

  try {
    
    let history = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1m`, { timeout: 10000 })
    return history.data

  } catch (error) {
    
    return 'No response'

  }
}



async function annotateData(data) {

  try {

    let history = []

    data.history.forEach(period => {
  
      let average = (
  
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
  
    let outputObject = {
  
      'history': history,
      'name': data.name
  
    }
  
    return outputObject

  } catch(error) {

    console.log(error.message)

  }
}



async function sortByArc(markets) {

  let n = markets.length

  for (let i = 0; i < n; i++) {
    let m = markets[i].history.length
    markets[i].shape = 0
    markets[i].pointHigh = 0
    markets[i].pointLow = 0
    let weighting = 1
    let changes = []
    markets[i].totalChange = markets[i].history[m - 1]['close'] - markets[i].history[0]['close']
    markets[i].percentageChange = markets[i].totalChange / markets[i].history[0]['close'] * 100
    let straightLineIncrement = markets[i].totalChange / m
    markets[i].bigDrop = 1
    markets[i].bigRise = 1
    let straightLine = markets[i].history[0]['close']

    for (let t = 0; t < m; t++) {

      let thisPeriod = markets[i].history[t]

      straightLine += straightLineIncrement
      markets[i].history[t].straightLine = straightLine

      if (thisPeriod['low'] < straightLine && thisPeriod['low'] / straightLine < markets[i].bigDrop) {

        markets[i].bigDrop = thisPeriod['low'] / straightLine
      }

      if (thisPeriod['high'] > straightLine && thisPeriod['high'] / straightLine > markets[i].bigRise) {

        markets[i].bigRise = thisPeriod['high'] / straightLine
      }
    }
    markets[i].shape = markets[i].percentageChange * markets[i].bigDrop / markets[i].bigRise
  }
  return markets.sort((a, b) => ((b.shape) - (a.shape)))
}



async function addEMA(markets) {

  try {

    // console.log('Analysing markets\n\n')

    let n = markets.length

    for (let i = 0; i < n; i++) {

      let market = markets[i]
      
      market.ema1 = ema(market.history, 1, 'close')
      market.ema233 = ema(market.history, 233, 'close')
    }
    return markets

  } catch (error) {

    console.log(error.message)

  }
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



function displayMarkets(markets, currentMarket) {

  console.log(`1. ${markets[0].name} ... %ch: ${markets[0].percentageChange} * drop: ${markets[0].bigDrop} / rise: ${markets[0].bigRise} = ${markets[0].shape}`)
  
  if (currentMarket !== undefined && markets[0].name !== currentMarket.name) {
    
    let prettyIndex

    for (let i = 0; i < markets.length; i++) {

      if (markets[i].name === currentMarket.name) {
      
        prettyIndex = i+1
        i = markets.length
      }
    }

    console.log(`${prettyIndex}. ${currentMarket.name} ... %ch: ${currentMarket.percentageChange} * drop: ${currentMarket.bigDrop} / rise: ${currentMarket.bigRise} = ${currentMarket.shape}`)
  }

  console.log('\n\n')
}



function getBulls(markets) {

  let bulls = markets.filter(market => 
    market.shape > 0 
    // && 
    // market.trend === 'up'
    // && 
    // market.ema1 > market.ema233
  )
  return bulls
}



async function fetchPrice(marketName) {

  try {

    let symbolName = marketName.replace('/', '')
    let rawPrice = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolName}`) 
    let price = parseFloat(rawPrice.data.price)
    return price

  } catch (error) {

    console.log(error.message)
  }
}



// async function simulatedBuyOrder(wallet, market, goodMarketNames, currentMarket) {
  
//   try {

//     let slash = market.name.indexOf('/')
//     let asset = market.name.substring(0, slash)
//     let base = market.name.substring(slash+1)
//     let response = await fetchPrice(market.name)

//     if (response === 'No response') {

//       console.log(`No response - starting new tick`)
//       tick(wallet, goodMarketNames, currentMarket)

//     } else {

//       let currentPrice = response
//       let baseVolume = wallet.currencies[base]['quantity']
//       if (wallet.currencies[asset] === undefined) { wallet.currencies[asset] = { 'quantity': 0 } }
//       let volumeToTrade = baseVolume * (1 - fee)
//       wallet.currencies[base]['quantity'] -= volumeToTrade
//       wallet.currencies[asset]['quantity'] += volumeToTrade * (1 - fee) / currentPrice
//       let targetVolume = baseVolume * (1 + (2 * fee))
//       wallet.targetPrice = targetVolume / wallet.currencies[asset]['quantity']
//       wallet.boughtPrice = currentPrice
//       wallet.stopLossPrice = wallet.boughtPrice * stopLossThreshold
//       wallet.highPrice = currentPrice
//       process.env.TARGET_PRICE = targetVolume / wallet.currencies[asset]['quantity']
//       process.env.BOUGHT_PRICE = currentPrice
//       process.env.STOP_LOSS_PRICE = wallet.boughtPrice * stopLossThreshold
//       process.env.HIGH_PRICE = currentPrice
//       await dbInsert({'targetPrice': wallet.targetPrice})
//       await dbInsert({'boughtPrice': wallet.boughtPrice})
//       await dbInsert({'stopLossPrice': wallet.stopLossPrice})
//       await dbInsert({'highPrice': wallet.highPrice})



//       wallet.boughtTime = Date.now()
//       let tradeReport = `${timeNow()} - Transaction - Bought ${wallet.currencies[asset]['quantity']} ${asset} @ ${currentPrice} ($${baseVolume * (1 - fee)})\nWave Shape: ${market.shape}  Target Price - ${wallet.targetPrice}\n\n`
//       await record(tradeReport)
//       tradeReport = ''
      
//       return {
//         'market': market, 
//         'wallet': wallet
//       }
//     }

//   } catch (error) {
    
//     console.log(error.message)

//   }
// }



async function liveBuyOrder(wallet, market, goodMarketNames, currentMarket) {
  
  try {

    if (doubleCheck(market)) {

      let slash = market.name.indexOf('/')
      let asset = market.name.substring(0, slash)
      let base = market.name.substring(slash+1)
      let response = await fetchPrice(market.name)

      if (response === 'No response') {

        // console.log(`No response - starting new tick`)
        tick(wallet, goodMarketNames, currentMarket)

      } else {

        let currentPrice = response
        let baseVolume = wallet.currencies[base]['quantity']
        let baseVolumeToTrade = baseVolume * (1 - fee)
        let assetVolumeToBuy = baseVolumeToTrade / currentPrice

        response = await binance.createLimitBuyOrder(market.name, assetVolumeToBuy, currentPrice)

        if (response !== undefined) {

          let lastBuy = response
          wallet.targetPrice = lastBuy.price * (1 + (3 * fee))
          wallet.stopLossPrice = market.bigDrop * market.history[market.history.length-1].straightLine
          await dbInsert({'targetPrice': wallet.targetPrice, 'stopLossPrice': wallet.stopLossPrice})
          wallet.boughtTime = lastBuy.timestamp
          let netAsset = lastBuy.amount * (1 - fee)
          let tradeReport = `${timeNow()} - Transaction - Bought ${netAsset} ${asset} @ ${lastBuy.price} ($${lastBuy.amount * lastBuy.price})\nWave Shape: ${market.shape}  Target Price - ${wallet.targetPrice}  Stop Loss - ${wallet.stopLossPrice}\n\n`
          wallet = await liveWallet(wallet, goodMarketNames, currentMarket)
          await record(tradeReport)
          tradeReport = ''
          let returnObject = {
            'market': market, 
            'wallet': wallet
          }
          return returnObject
        }
      }
    } else {

      // console.log('Potential market no longer viable')
    }
  } catch (error) {
    
    console.log(error.message)

  }
}



async function doubleCheck(market) {
  
  let marketArray = await fetchAllHistory([market.name], market.name)
  if (marketArray.includes('No response for current market')) {

    return false

  } else {
    
    marketArray = await sortByArc(marketArray)
    marketArray = await addEMA(marketArray)
    marketArray = getBulls(marketArray)

    if (marketArray.length === 0) {

      return false
    }
  }
}



function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
}



async function simulatedSellOrder(wallet, market, sellType) {

  let tradeReport

  try {
    
    let slash = market.name.indexOf('/')
    let asset = market.name.substring(0, slash)
    let base = market.name.substring(slash + 1)
    let assetVolume = wallet.currencies[asset]['quantity']
    if (wallet.currencies[base] === undefined) { wallet.currencies[base] = { 'quantity': 0 } }
    wallet.currencies[base]['quantity'] += assetVolume * (1 - fee) * market.currentPrice
    wallet.currencies[asset]['quantity'] -= assetVolume
    wallet.targetPrice = undefined

    tradeReport = `${timeNow()} - Sold ${assetVolume} ${asset} @ ${market.currentPrice} ($${wallet.currencies[base]['quantity']}) [${sellType}]\n\n`
    record(tradeReport)
    tradeReport = ''

  } catch (error) {
    
    console.log(error.message)

  }
}



async function liveSellOrder(wallet, market, sellType, goodMarketNames, currentPrice) {

  let tradeReport

  try {
    
    let slash = market.name.indexOf('/')
    let asset = market.name.substring(0, slash)
    let assetVolume = wallet.currencies[asset]['quantity']
    await binance.createLimitSellOrder(market.name, assetVolume, currentPrice)
    tradeReport = `Target price: ${wallet.targetPrice}\nHigh Price: ${wallet.highPrice}\nBought Price: ${wallet.boughtPrice}\nStop Loss Price: ${wallet.stopLossPrice}\nLow Price: ${wallet.lowPrice}\n${timeNow()} - Transaction - Selling ${assetVolume} ${asset} @ ${market.currentPrice} ($${assetVolume * market.currentPrice}) [${sellType}]\nHigh Price: ${wallet.highPrice} ... Low Price: ${wallet.lowPrice}\n`
    wallet.targetPrice = undefined
    wallet = await liveWallet(wallet, goodMarketNames, market)
    record(tradeReport)
    tradeReport = ''

  } catch (error) {
    
    console.log(error.message)

  }
}

app.listen(port);

run();



