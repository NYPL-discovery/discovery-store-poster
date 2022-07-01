const AWS = require('aws-sdk')
AWS.config.region = 'us-east-1'
const lambda = new AWS.Lambda()

const parseDate = async function (dates) {
  const preparsingObjects = [parens, colon, twoYearRangeMulti, yearRangeWithSlash, soloRangeSlash, shortYearBug, monthRangeWithSlash]
  if (!Array.isArray(dates)) dates = [dates]
  const preparsedDates = dates.map((date) => {
    preparsingObjects.forEach((preparse) => {
      if (date.match(preparse.matchExpression)) {
        date = preparse.transform(date)
      }
    })
    return date
  })
  try {
    return await timeTwist(preparsedDates)
  } catch (e) {
    console.error(e)
  }
}

const timeTwist = async (preparsedDates) => {
  const payloadStr = JSON.stringify({
    path: '/',
    body: JSON.stringify({ dates: preparsedDates })
  })
  const params = {
    FunctionName: 'DateParser-qa',
    Payload: payloadStr
  }
  try {
    const { Payload } = await lambda.invoke(params).promise()
    // Extract date information from payload
    const payloadParsed = preparsedDates.map((date) => JSON.parse(JSON.parse(Payload).body).dates[date])
    // Convert from object into nested array
    // const ranges = payloadParsed.map((results) => results.map((result) => ({ start: result.date_start, end: result.date_end })))
    const ranges = payloadParsed.map((results) => results.map((result) => ([result.date_start, result.date_end])))
    return ranges
  } catch (error) {
    console.error(error)
  }
}

const parens = {
  matchExpression: /\((.+)\)/,
  transform: function (range) {
    const match = range.match(this.matchExpression)
    return match[0]
  }
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June?', 'July?', 'Aug', 'Sept?', 'Oct', 'Nov', 'Dec']
const monthPattern = `(${monthNames.join('|')}).?`
const seasonNames = ['Win(ter)?', '(Autumn|Fall?)', 'Spr(ing)?', 'Sum(mer)?']
const seasonPattern = `(${seasonNames.join('|')}).?`
const monthOrSeasonPattern = `(${monthPattern}|${seasonPattern})`

const colon = {
  matchExpression: new RegExp(`\\d{4}:${monthOrSeasonPattern}`, 'i'),
  transform: function (range) {
    return range.split(':')[1] + ' ' + range.split(':')[0]
  }
}

const soloRangeSlash = {
  matchExpression: /(?<!(?:no|v)\.?\s?)(?:^|\s|-)\d{4}\/(\d{4}|\d{2})/g,
  transform: function (range) {
    const rangeMatch = range.match(this.matchExpression)
    return rangeMatch[0].replace(/\//, '-')
  }
}

// 1956/57-1981/82
const twoYearRangeMulti = {
  matchExpression: /(?<!(no|v)\.\s?)\d{4}\/(\d{4}|\d{2})-\d{4}\/(\d{4}|\d{2})/gi,
  transform: (ranges) => {
    // turn 1956/57-1981/82 into 1956-82 and 1956/57-2001/02 into 1956-2002
    const range = ranges.match(/(\d{4})\/(\d{4}|\d{2})-\d{4}\/(\d{4}|\d{2})/)
    // Take the second capture group and the fourth, which are the first year in the string and the last.
    const start = range[1]
    let end = range[3]
    // for ranges that end up 1999-02, turn into 1999-2002
    if (start.match(/^19/) && end.match(/^0\d/)) {
      end = '20' + end
    }
    return start + '-' + end
  }
}

// addressing mysterious bug in timetwister that causes null values for XX0X-0X ranges
const shortYearBug = {
  matchExpression: /(\d{4})-(0\d)/,
  transform: function (range) {
    const shortYear = range.match(this.matchExpression)[0]
    const century = range.match(/^\d{2}/)
    return range.replace(/(?<=-)(0\d)/, century + shortYear)
  }
}

// month-month/month ' May-June/July 1963,  Oct. 1961-Sept./Oct. 1962'
const monthRangeWithSlash = {
  matchExpression: /(?<=-)[a-z]{3,4}\.?\/|\/[a-z]{3,4}\./gi,
  transform: function (range) {
    return range.replace(this.matchExpression, '')
  }
}

// 1895-1896/1897
const yearRangeWithSlash = {
  matchExpression: /(?<!(?:no|v)\.\s?)(\d{4}-)\d{4}\/(\d{4})/,
  transform: function (range) {
    const years = range.match(this.matchExpression)
    return years[1] + years[2]
  }
}

module.exports = { parseDate }
