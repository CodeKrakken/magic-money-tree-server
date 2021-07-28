require('dotenv').config();

const axios = require('axios')
const ccxt = require('ccxt');

const binance = new ccxt.binance({

  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,

});


async function run() {

  let market = await fetchAllHistory(['SUPER/USDT'])
  sortByArc(market)
}



async function fetchAllHistory(marketNames, currentMarketName) {

  console.log('Fetching history\n')
  let n = marketNames.length
  let returnArray = []

  for (let i = 0; i < n; i ++) {

    try {

      let marketName = marketNames[i]
      let symbolName = marketName.replace('/', '')
      let response = await fetchOneHistory(symbolName)

      if (response === 'No response' && marketName === currentMarketName) { 

        console.log(`No response for current market`)
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

    for (let t = 1; t < m-1; t++) {

      let lastPeriod = markets[i].history[t-1]
      let thisPeriod = markets[i].history[t]
      let nextPeriod = markets[i].history[t+1]

      console.log(`Period: ${t}`)
      console.log(`Time: ${new Date(markets[i].history[t]['startTime']).toLocaleString()}`)
      console.log(`Open: ${markets[i].history[t]['open']}`)
      console.log(`High: ${markets[i].history[t]['high']}`)
      console.log(`Low: ${markets[i].history[t]['low']}`)
      console.log(`Close: ${markets[i].history[t]['close']}`)
      console.log(`Shape: ${markets[i].shape}`)
      console.log(`Point high: ${markets[i].pointHigh}`)
      console.log(`Point low: ${markets[i].pointLow}`)
      console.log(`Trend: ${markets[i].trend}`)
      console.log('\n')


      if (thisPeriod['close'] > thisPeriod['open']) {

        markets[i].shape += 1
      
      } else if (thisPeriod['close'] < thisPeriod['open']) {

        markets[i].shape -= 1

      }

  //     if (thisPeriod['low'] < lastPeriod['low'] && thisPeriod['low'] < nextPeriod['low']) {
         
  //       if (thisPeriod['low'] > markets[i].history[markets[i].pointLow]['low']) {

  //         markets[i].shape += thisPeriod['endTime'] * ((thisPeriod['low'] - markets[i].history[markets[i].pointLow]['low']) / thisPeriod['low'])

  //       } else if (thisPeriod['low'] < markets[i].history[markets[i].pointLow]['low']) {

  //         markets[i].trend = 'down'
  //         markets[i].pointLow = t
  //         markets[i].shape -= thisPeriod['endTime'] * ((markets[i].history[markets[i].pointLow]['low'] - thisPeriod['low']) / markets[i].history[markets[i].pointLow]['low'])
  //       }
  //     }

  //     if (thisPeriod['high'] > lastPeriod['high'] && thisPeriod['high'] > nextPeriod['high']) {
        
  //       if (thisPeriod['high'] > markets[i].history[markets[i].pointHigh]['high']) {

  //         markets[i].trend = 'up'
  //         markets[i].pointHigh = t
  //         markets[i].shape += thisPeriod['endTime'] * ((thisPeriod['high'] - markets[i].history[markets[i].pointHigh]['high']) / thisPeriod['high'])

  //       } else if (thisPeriod['high'] < markets[i].history[markets[i].pointHigh]['high']) {

  //         markets[i].shape -= thisPeriod['endTime'] * ((markets[i].history[markets[i].pointHigh]['high'] - thisPeriod['high']) / markets[i].history[markets[i].pointHigh]['high'])
  //       }
  //     }
    }
  }
  return markets.sort((a, b) => b.shape - a.shape)
}



function newArc(markets) {



}



run()