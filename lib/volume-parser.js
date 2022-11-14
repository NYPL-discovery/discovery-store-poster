/**
 * Given a fieldtag v value, returns an array of ranges, each represented as a
 * two element array
 */

exports.parseVolume = (fieldTagV) => {
  const regExp = [
    // Captured values are the numbers found after volume/vol/v, no, bd, and reel/r with or without periods
    // (?:^|\s|-) is a non-capturing group to ensure that we are not matching on parts of other words
    /(?:^|\s|-)(?:volume|vol\.?|v\.?)\s?(\d*)[-|/]?(\d*)?/gi,
    /(?:^|\s|-)(?:bd\.?)\s?(\d*)[-|/]?(\d*)?/gi,
    /(?:^|\s|-)(?:reel|r\.?)\s?(\d*)[-|/]?(\d*)?/gi,
    /(?:^|\s|-)(?:no\.?)\s?(\d*)[-|/]?(\d*)?/gi,
    /jaarg\.?/gi,
    /\b(\d{1,3})\b/g
  ]

  let volumes = []
  // loop through regular expressions
  regExp.forEach((exp) => {
    // we only want to match on one type of regular expression to avoid
    // weirdness with field tag vs that have vol. and no.
    if (!volumes.length) {
      // convert regexp iterator into array so we can get successive matches
      const matches = [...fieldTagV.matchAll(exp)]
      // returns nested array with ranges, ie [[4,10],[11,15]]
      volumes = extractVols(matches)
    }
  })
  return volumes
    .filter((range) => Array.isArray(range) && range.length === 2)
}

const extractVols = (matches) => {
  return matches.reduce((vols, match) => {
    // extract the numbers from regex array-like object
    match = match.slice(1, 3)
      // Eliminate null values
      .filter(m => m)
      // convert from string to int
      .map(m => parseInt(m, 10))
    // [6,7,8] ==> [6,8]
    if (match.length > 2) match = [match[0], match[match.length - 1]]
    if (match.length === 1) match = [match[0], match[0]]
    return [...vols, match]
  }, [])
}
