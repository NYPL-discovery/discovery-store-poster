const AWS = require('aws-sdk')
AWS.config.region = 'us-east-1'
const lambda = new AWS.Lambda()

const isolateDateFromWithinParens = (date) => {
  // vol 7(1992:feb-mar)
  if (date.match(/\(.*\)/)) {
    date = date.match(/(?<=\().*(?=\))/)[0]
  }
  return date
}

// turn 1956/57 into 1956-57, but only if it is the only range
const soloRangeRemoveSlash = (range) => {
  if (range.match(/^[0-9]{4}\/([0-9]{2}|[0-9]{4})$/)) {
    range = range.replace(/\//, '-')
  }
  return range
}

// 1992:mar-June or 1992:spring
const removeColonAndFlip = (date) => {
  if (date.match(/[0-9]{4}:[a-zA-Z]*/)) {
    date = date.split(':')[1] + ' ' + date.split(':')[0]
  }
  return date
}

const fixAbbreviatedSeasons = (date) => {
  date = date.replace(/[Ww](inter|in\.?)/, 'January ')
  date = date.replace(/[Ss](pring|pr\.?)/, 'March ')
  date = date.replace(/[Ss](ummer|um\.?)/, 'June ')
  date = date.replace(/[Aa](utumn|ut\.?)/, 'September ')
  return date
}
const twoYearRanges = (ranges) => {
  // turn 1956/57-1981/82 into 1956-82 and 1956/57-2001/02 into 1956-2002
  if (ranges.match(/[0-9]{4}\/([0-9]{4}|[0-9]{2})-[0-9]{4}\/([0-9]{4}|[0-9]{2})/)) {
    const range = ranges.match(/([0-9]{4})\/([0-9]{4}|[0-9]{2})-[0-9]{4}\/([0-9]{4}|[0-9]{2})/)
    // Take the second capture group and the fourth, which are the first year in the string and the last.
    const start = range[1]
    let end = range[3]
    // for ranges that end up 1999-02, turn into 1999-2002
    if (start.match(/^19/) && end.match(/^0[0-9]/)) {
      end = '20' + end
    }
    ranges = start + '-' + end
  }
  return ranges
}

// addressing mysterious bug in timetwister that causes null values for 190X-0X ranges
const squashShortYearBug = (range) => {
  if (range.match(/[0-9]{4}-(0[0-9])/)) {
    const shortYear = range.match(/(?<=-)(0[0-9])/)
    range = range.replace(/(?<=-)(0[0-9])/, `19${shortYear}`)
  }
  return range
}

exports.parseDate = async function (date) {
  let preparsedDate = isolateDateFromWithinParens(date)
  preparsedDate = soloRangeRemoveSlash(preparsedDate)
  preparsedDate = removeColonAndFlip(preparsedDate)
  preparsedDate = fixAbbreviatedSeasons(preparsedDate)
  preparsedDate = twoYearRanges(preparsedDate)
  preparsedDate = squashShortYearBug(preparsedDate)

  console.log('after preparsing', preparsedDate)
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
    const payloadParsed = JSON.parse(JSON.parse(Payload).body).dates[preparsedDate][0]
    const dateRange = { start: payloadParsed.date_start, end: payloadParsed.date_end }
    return dateRange
  } catch (error) {
    console.error(error)
  }
}
