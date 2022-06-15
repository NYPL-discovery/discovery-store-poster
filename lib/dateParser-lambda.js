const AWS = require('aws-sdk')
AWS.config.region = 'us-east-1'
const lambda = new AWS.Lambda()

const parseDate = async function (date) {
  const classifications = classifyDate(date)
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
    }
  })

  let dateRange
  try {
    dateRange = await timeTwist(preparsedDate)
  } catch (e) {
    console.error(e)
  }
  // If timetwister failed to meaningfully do anything, hail mary to at least have a range of years
  if (Object.values(dateRange).includes(null)) {
    preparsedDate = parseOnlyYears(preparsedDate)
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

// build an object that includes the date as well as classifications based on regex matches
const classifyDate = (date) => {
  const classifications = []
  // vol 7(1992:feb-mar)
  if (date.match(/\(.*\)/)) classifications.push('dateWithinParens')
  // 1992:mar-June or 1992:spring
  if (date.match(/[0-9]{4}:[a-zA-Z]*/)) classifications.push('colon')
  // 1956/57, but only if it is the only range
  if (date.match(/^[0-9]{4}\/([0-9]{2}|[0-9]{4})$/)) classifications.push('twoYearRangeSolo')
  // 1956/57-1981/82 (w 2 or 4 years after slash)
  if (date.match(/[0-9]{4}\/([0-9]{4}|[0-9]{2})-[0-9]{4}\/([0-9]{4}|[0-9]{2})/)) classifications.push('twoYearRangeMulti')
  // waiting on timetwister to update to include this
  // if (date.match(/[a-z]{3}\.?/i)) classifications.push('abbreviatedSeason')
  // addressing mysterious bug in timetwister that causes null values for XX0X-0X ranges
  if (date.match(/([0-9]{4})-(0[0-9])/)) classifications.push('0X')
  // month-month/month ' May-June/July 1963,  Oct. 1961-Sept./Oct. 1962'
  if (date.match(/((?<=-)[a-z]{3,4}\.?\/|\/[a-z]{3,4}\.|\/(?<=-))/gi)) classifications.push('month-month/month')
  return classifications
}

const isolateDateFromWithinParens = (date) => {
  return date.match(/(?<=\().*(?=\))/)[0]
}


const soloRangeRemoveSlash = (range) => {
  return range.replace(/\//, '-')
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

const seasonsToMonth = (date) => {
  date = date.replace(/[Ww](inter|in\.?)/, 'January ')
  date = date.replace(/[Ss](pring|pr\.?)/, 'March ')
  date = date.replace(/[Ss](ummer|um\.?)/, 'June ')
  date = date.replace(/[Aa](utumn|ut\.?)/, 'September ')
  return date
}

const twoYearRanges = (ranges) => {
  // turn 1956/57-1981/82 into 1956-82 and 1956/57-2001/02 into 1956-2002
  const range = ranges.match(/([0-9]{4})\/([0-9]{4}|[0-9]{2})-[0-9]{4}\/([0-9]{4}|[0-9]{2})/)
  // Take the second capture group and the fourth, which are the first year in the string and the last.
  const start = range[1]
  let end = range[3]
  // for ranges that end up 1999-02, turn into 1999-2002
  if (start.match(/^19/) && end.match(/^0[0-9]/)) {
    end = '20' + end
  }
  return start + '-' + end
}

const squashShortYearBug = (range) => {
  const shortYear = range.match(/(?<=-)(0[0-9])/)[0]
  const century = range.match(/^[0-9]{2}/)
  return range.replace(/(?<=-)(0[0-9])/, century + shortYear)
}

const monthRangeWithSlash = (range) => {
  return range.replace(/((?<=-)[a-z]{3,4}\.?\/|\/[a-z]{3,4}\.|\/(?<=-))/gi, '')
}

const parseOnlyYears = (date) => {
  const years = date.match(/[0-9]{4}/g)
  return years.join(',')
}

module.exports = { parseDate }
