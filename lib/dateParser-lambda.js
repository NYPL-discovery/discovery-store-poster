const AWS = require('aws-sdk')
AWS.config.region = 'us-east-1'
const lambda = new AWS.Lambda()

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June?', 'July?', 'Aug', 'Sept?', 'Oct', 'Nov', 'Dec']
const monthPattern = `(${monthNames.join('|')}).?`
const seasonNames = ['Win(ter)?', '(Autumn|Fall?)', 'Spr(ing)?', 'Sum(mer)?']
const seasonPattern = `(${seasonNames.join('|')}).?`
const monthOrSeasonPattern = `(${monthPattern}|${seasonPattern})`

const parseDate = async function (date) {
  const classifications = classifyDate(date)
  const preparsedDate = preparse(date, classifications)
  let dateRange
  try {
    dateRange = await timeTwist(preparsedDate)
  } catch (e) {
    console.error(e)
  }
  return dateRange.map((range) => [range.start, range.end])
}

const timeTwist = async (preparsedDate) => {
  const payloadStr = JSON.stringify({
    path: '/',
    body: JSON.stringify({ dates: [preparsedDate] })
  })
  const params = {
    FunctionName: 'DateParser-production',
    Payload: payloadStr
  }
  try {
    const { Payload } = await lambda.invoke(params).promise()
    const payloadParsed = JSON.parse(JSON.parse(Payload).body).dates[preparsedDate]
    const ranges = payloadParsed.map((result) => ({ start: result.date_start, end: result.date_end }))
    return ranges
  } catch (error) {
    console.error(error)
  }
}

// create array of classifications to determine transformations
const classifyDate = (date) => {
  const classifications = []
  // vol 7(1992:feb-mar)
  if (date.match(/\(.+\)/)) classifications.push('dateWithinParens')
  // 1992:mar-June or 1992:spring
  const colonRegExp = new RegExp(`\\d{4}:${monthOrSeasonPattern}`, 'i')
  if (date.match(colonRegExp)) classifications.push('colon')
  // 1956/57-1981/82 (w 2 or 4 years after slash)
  if (date.match(/(?<!(no|v)\.\s?)\d{4}\/(\d{4}|\d{2})-\d{4}\/(\d{4}|\d{2})/gi)) classifications.push('twoYearRangeMulti')
  // 1956/57, but only if it is the only range
  const yearRange = date.match(/(?<!(no|v)\.\s?)(?:^|\s|-)\d{4}[/|-](\d{4}|\d{2})/g)
  if (yearRange && !classifications.includes('twoYearRangeMulti')) {
    classifications.push('twoYearRangeSolo')
  }
  // waiting on timetwister to update to include this
  // if (date.match(/[a-z]{3}\.?/i)) classifications.push('abbreviatedSeason')
  // addressing mysterious bug in timetwister that causes null values for XX0X-0X ranges
  if (date.match(/(\d{4})-(0\d)/)) classifications.push('0X')
  // month-month/month ' May-June/July 1963,  Oct. 1961-Sept./Oct. 1962'
  if (date.match(/(?<=-)[a-z]{3,4}\.?\/|\/[a-z]{3,4}\./gi)) classifications.push('month-month/month')
  if (classifications.length === 0 && date.match(/\d{4}/g)) {
    classifications.push('lastChance')
  }
  return classifications
}

const preparse = (date, classifications) => {
  let preparsedDate = date
  classifications.forEach((classification) => {
    switch (classification) {
      case 'dateWithinParens':
        preparsedDate = isolateDateFromWithinParens(preparsedDate)
        break
      case 'colon':
        preparsedDate = removeColonAndFlip(preparsedDate)
        break
      case 'twoYearRangeSolo':
        preparsedDate = soloRangeRemoveSlash(preparsedDate)
        break
      case 'twoYearRangeMulti':
        preparsedDate = twoYearRanges(preparsedDate)
        break
      case 'abbreviatedSeason':
        preparsedDate = fixAbbreviatedSeasons(preparsedDate)
        break
      case '0X':
        preparsedDate = squashShortYearBug(preparsedDate)
        break
      case 'month-month/month':
        preparsedDate = monthRangeWithSlash(preparsedDate)
        break
      // case 'lastChance':
      //   preparsedDate = parseOnlyYears(preparsedDate)
      //   break
    }
  })
  return preparsedDate
}

const isolateDateFromWithinParens = (date) => {
  const dateMatch = date.match(/\((.+)\)/)
  if (dateMatch.length) return dateMatch[0]
}

const soloRangeRemoveSlash = (range) => {
  const rangeMatch = range.match(/\d{4}[/|-](\d{4}|\d{2})/)
  if (rangeMatch.length) return rangeMatch[0].replace(/\//, '-')
}

const removeColonAndFlip = (date) => {
  return date.split(':')[1] + ' ' + date.split(':')[0]
}

const fixAbbreviatedSeasons = (date) => {
  date = date.replace(/Win\.?/gi, 'Winter ')
  date = date.replace(/Spr\.?/gi, 'Spring ')
  date = date.replace(/Sum\.?/gi, 'Summer ')
  date = date.replace(/Aut\.?/gi, 'Autumn ')
  return date
}

// const seasonsToMonth = (date) => {
//   date = date.replace(/[Ww](inter|in\.?)/, 'January ')
//   date = date.replace(/[Ss](pring|pr\.?)/, 'March ')
//   date = date.replace(/[Ss](ummer|um\.?)/, 'June ')
//   date = date.replace(/[Aa](utumn|ut\.?)/, 'September ')
//   return date
// }

const twoYearRanges = (ranges) => {
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

const squashShortYearBug = (range) => {
  const shortYear = range.match(/(?<=-)(0\d)/)[0]
  const century = range.match(/^\d{2}/)
  return range.replace(/(?<=-)(0\d)/, century + shortYear)
}

const monthRangeWithSlash = (range) => {
  return range.replace(/(?<=-)[a-z]{3,4}\.?\/|\/[a-z]{3,4}\./gi, '')
}

const parseOnlyYears = (date) => {
  const years = date.match(/\d{4}/g)
  return years.join(',')
}

module.exports = { parseDate }
