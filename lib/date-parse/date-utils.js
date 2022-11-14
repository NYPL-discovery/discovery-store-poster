/**
 *
 * Given a date string, returns an ISO8601 formatting of the date
 *
 * Minimal season support
 */
const parseCheckinCardDate = (s) => {
  const seasonMap = [
    {
      match: /\bSum(\.|mer)?\b/,
      replace: 'Jul.'
    },
    {
      match: /\bSpr(\.|ing)?\b/,
      replace: 'Apr.'
    },
    {
      match: /\b(Fall|Aut(\.|umn)?)\b/,
      replace: 'Oct.'
    },
    {
      match: /\bWin(\.|ter)?\b/,
      replace: 'Jan.'
    }
  ]
  seasonMap.forEach((rule) => {
    if (rule.match.test(s)) {
      s = s.replace(rule.match, rule.replace)
    }
  })

  let date
  try {
    date = new Date(s)
    return date.toISOString().replace(/T.+/, '')
  } catch (e) {
    console.error(`DateParse: DateUtils: Could not parse '${s}' as date`)
    return null
  }
}

module.exports = {
  parseCheckinCardDate
}
