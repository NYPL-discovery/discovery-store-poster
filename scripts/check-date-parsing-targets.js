/**
 *
 * Operates on data exported from the fieldtagv parsing targets spreadsheet:
 *   https://docs.google.com/spreadsheets/d/1DDIn0z0qcX5yPnEK6SE_-FE3AHIbNPLyrqD2uv-ZMpY/edit#gid=1918982528
 *
 * Reports on how the current date and volume parsing mechanism matches
 * expectations.
 *
 * Usage:
 *   node scripts/check-date-parsing-targets [--limit N] [--index K] [--failures boolean]
 *
 * Arguments:
 *   --index N - Start processing at (0-indexed) row of input
 *   --limit K - Limit processing to this many rows
 *   --failures - display failed ranges
 *
 * Expects a file called ../data/date-and-volume-parsing-targets.csv in UTF8
 * formatted with \n linebreaks exportd from parsing targets spreadsheet
 *
 * If you encounter linebreak issues with CSVs exported directly from Google
 * Sheets (because Sheets exports with CR linebreaks for some reason), use the
 * following command to remove the CRs (in OSX):
 *
 *   sed -i.bak $'s/\r//'
 *
 */

const fs = require('fs')
const parse = require('csv-parse')

const argv = require('minimist')(process.argv.slice(2))

const input = fs.readFileSync('./data/date-and-volume-parsing-targets.csv', 'utf8')

const dateParser = require('../lib/dateParser-lambda')
const volumeParser = require('../lib/volume-parser')

const parseRangeTargets = (target, intRange = false) => {
  return target
    .match(/(?<=\[)([^\]]+)(?=\])/g)
    .map((range) => range.split(/, ?/))
    .map((range) => {
      return intRange ? range.map((v) => parseInt(v)) : range
    })
}

const totals = {
  volumeRanges: {
    inspected: 0,
    matched: 0,
    failures: []
  },
  dateRanges: { inspected: 0, matched: 0, failures: [] }
}

const processNext = async (records, index = 0) => {
  const { fieldtagv, volumeRange, dateRange } = records[index]
  console.log(`${(argv.index || 0) + index}. Parsing: "${fieldtagv}"`)

  let match = true

  if (dateRange && argv.only !== 'volumes') {
    let parsed = await dateParser.parseDate(fieldtagv)
    parsed = parsed[0]
    const targets = parseRangeTargets(dateRange)
    match = checkParsedAgainstTargets(parsed, targets, { label: 'Date' })
    totals.dateRanges.inspected += 1
    if (match) totals.dateRanges.matched += 1
    else totals.dateRanges.failures.push(`\n${fieldtagv}`)
  }
  if (volumeRange && argv.only !== 'dates') {
    let parsed = volumeParser.parseVolume(fieldtagv)
    parsed = parsed[0]
    // If volume parsing returns single array, make it a 2D array to match targets:
    if (parsed[0] && !Array.isArray(parsed[0])) parsed = [parsed]
    const targets = parseRangeTargets(volumeRange, true)
    match = checkParsedAgainstTargets(parsed, targets, { label: 'Volume' })
    totals.volumeRanges.inspected += 1
    if (match) totals.volumeRanges.matched += 1
    else totals.volumeRanges.failures.push(`\n${fieldtagv}`)
  }

  // if (dateRange || volumeRange) {
  //   totals.inspected += 1
  //   if (overallMatch) totals.matched += 1
  // }

  if (records[index + 1]) processNext(records, index + 1)
  else {
    const percentageMatchedDates = (totals.dateRanges.matched / totals.dateRanges.inspected) * 100
    const percentageMatchedVolumes = (totals.volumeRanges.matched / totals.volumeRanges.inspected) * 100
    console.log('_____________')
    if (argv.only !== 'dates') console.log(`Finished inspecting ${totals.volumeRanges.inspected} volume ranges against targets: ${percentageMatchedVolumes.toFixed(1)}% matched`)
    if (argv.only !== 'volumes') console.log(`Finished inspecting ${totals.dateRanges.inspected} date ranges against targets: ${percentageMatchedDates.toFixed(1)}% matched`)

    if (argv.failures === 'true') console.log(`Failed volumes: ${totals.volumeRanges.failures}\nFailed dates: ${totals.dateRanges.failures}`)
  }
}

const checkParsedAgainstTargets = (parsed, targets, options) => {
  // Set up a series of checks to compare parsed to targets:
  const checks = {
    'num-ranges': parsed.length === targets.length
  }
  targets.forEach((target, index) => {
    checks[`target-${index}-start`] = parsed[index] ? target[0] === parsed[index][0] : false
    checks[`target-${index}-end`] = parsed[index] ? target[1] === parsed[index][1] : false
  })

  // It's a match if all checks passed:
  const isMatch = Object.keys(checks).reduce((isMatch, k) => {
    return isMatch && checks[k]
  }, true)

  if (isMatch) {
    console.log(`  ✅ ${options.label} parsed as ${JSON.stringify(parsed)}`)
  } else {
    // Not a match; Report on what failed:
    console.log(`  ❌ ${options.label} parsing failed to match target`)
    const checkLines = Object.keys(checks).reduce((a, k) => {
      return a.concat([`${checks[k] ? '✅' : '❌'} ${k}`])
    }, [])
    console.log('     Checks: \n' + checkLines.map((l) => `       ${l}`).join('\n'))
    console.log('     Input parsed as: ', JSON.stringify(parsed))
    console.log('     Target ranges:   ', JSON.stringify(targets))
  }
  return isMatch
}

const handleRecords = (err, records) => {
  if (err) {
    console.error('Error parsing inputs', err)
    return
  }

  if (typeof argv.index !== 'undefined') records = records.slice(argv.index)
  if (typeof argv.limit !== 'undefined') records = records.slice(0, argv.limit)

  processNext(records)
}

parse(input, { relax_column_count: true, columns: true }, handleRecords)
