const AWS = require('aws-sdk')
const log = require('loglevel')
const SierraItem = require('../models/item-sierra-record')

const { preparsingObjects, returnOneYear } = require('./preparsingObjects')

AWS.config.region = 'us-east-1'

let lambda

function lambdaClient () {
  if (!lambda) lambda = new AWS.Lambda()
  return lambda
}

/**
 * Given an array of bibs that already have items attached, returns an
 * array of the fieldtagvs from all items on the bib.
 */
const extractFieldtagvs = (bibs) => {
  return bibs
    .map((bib) => {
      return bib.items.map((item) => {
        return (new SierraItem(item)).fieldTag('v')[0]
      })
    })
    .flat()
    .filter((fieldtagv) => fieldtagv)
}

/**
 *
 * @param {*} batchSize a number
 * @param {*} originalArray array
 * @returns a nested array whose elements have a maximum
 *  length of batchsize
 */

const batchDates = (batchSize, originalArray) => {
  const batches = []
  for (let i = 0; i < originalArray.length; i += batchSize) {
    batches.push(originalArray.slice(i, i + batchSize))
  }
  return batches
}

let dateCache = {}

const checkCache = (fieldtagv) => {
  return dateCache[fieldtagv]
}

/**
 *
 * @param {*} dates, an array of strings representing field tag 'v'
 * @returns an array of those dates with some string manipulation
 *  so the data plays nicely with timetwister
 */

const preparse = function (dates) {
  return dates.map((date) => {
    // do some string manipulation so data works better with timetwister lambda
    preparsingObjects.forEach((preparse) => {
      if (date.match(preparse.matchExpression)) {
        date = preparse.transform(date)
      }
    })
    return date
  })
    // After applying "preparsing" corrections to the data, remove anything
    // that doesn't have at least a four digit year (minimum for a parsable
    // date)
    .filter(_has4DigitYear)
}

/**
 * Returns true if string appears to have at least one 4-digit year
 */
const _has4DigitYear = (d) => /\b\d{4}\b/.test(d)

/**
 *
 * @param {array} bibs an array of bibs with items attached
 * @returns nothing, used for side effect of calling timetwister lambda and filling cache
 */

const parseDatesAndCache = async function (bibs) {
  const dates = extractFieldtagvs(bibs)
  try {
    const ranges = await _parseDates(dates)
    dateCache = dates.reduce((cache, date, i) => {
      return { ...cache, [date]: ranges[i] }
    }, {})
  } catch (e) {
    console.error(e)
  }
}

/**
 * This function is used for testing the date parsing mechanism
 * via scripts/check-date-parsing-targets.js and test/date-parse-test.js
 */

const _parseDates = async function (dates) {
  if (!Array.isArray(dates)) dates = [dates]
  const preparsedDates = preparse(dates)
  try {
    let ranges = await timeTwist(preparsedDates)
    ranges = filterNulls(ranges, preparsedDates)
    // ranges is returned super nested:
    /**
     * all fieldtagvs [
        individual fieldtagv [
          all parsed ranges [
            individual range [date, date]
          ]
        ]
      ]
     *  */
    return ranges
  } catch (e) {
    console.error(e)
  }
}

/**
 *
 * @param {*} preparsedDates, an array of strings
 * @returns an array of parsed dates
 */

const timeTwist = async (preparsedDates) => {
  const preparsedDatesBatches = batchDates(1000, preparsedDates)

  log.debug(`Invoking lambda with ${preparsedDatesBatches.length} batches of ${preparsedDates.length} dates`)
  const timetwistedDates = await Promise.all(preparsedDatesBatches.map(async (batch) => {
    const params = {
      FunctionName: 'DateParser-qa',
      Payload: JSON.stringify({
        path: '/',
        body: JSON.stringify({ dates: batch })
      })
    }
    try {
      log.debug(`  Invoking lambda with ${params.Payload}`)
      const { Payload } = await lambdaClient().invoke(params).promise()
      // Extract date information from payload
      const payloadParsed = batch
        .map((date) => JSON.parse(JSON.parse(Payload).body).dates[date])
      // Convert from object into nested array
      const ranges = payloadParsed
        .filter((result) => result)
        .map((results) => results.map((result) => ([result.date_start, result.date_end])))
      return ranges
    } catch (error) {
      console.error(error)
    }
  }))
  log.debug('/Finished invoking dateparser lambda')
  return timetwistedDates.flat()
}

const filterNulls = (rangesArray, preparsedDates) => {
  return rangesArray.map((rangesPerFieldtagv, rangesArrayIndex) => {
    return rangesPerFieldtagv.map((range) => {
      // If both values of a range are null, try and match on a single year in fieldtagv
      if (range[0] === null || range[1] === null) {
        const singleYear = returnOneYear.transform(preparsedDates[rangesArrayIndex])
        if (singleYear) {
          return [singleYear, singleYear]
        }
        // need to explicitly return null for standardjs linting
        return null
      } else return range
    })
  })
}

module.exports = { parseDatesAndCache, checkCache, private: { _parseDates, _has4DigitYear } }
