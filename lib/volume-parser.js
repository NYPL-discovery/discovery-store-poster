exports.parseVolume = (fieldTagV) => {
  const regExp = [
    // Captured values are the numbers found after volume/vol/v, no, bd, and reel/r with or without periods
    // (?:^|\s|-) is a non-capturing group to ensure that we are not matching on parts of other words
    /(?:^|\s|-)(?:volume|vol\.?|v\.?)\s?(\d*)[-|/]?(\d*)?/gi,
    /(?:^|\s|-)(?:bd\.?)\s?(\d*)[-|/]?(\d*)?/gi,
    /(?:^|\s|-)(?:reel|r\.?)\s?(\d*)[-|/]?(\d*)?/gi,
    /jaarg\.?/gi,
    /(?:^|\s|-)(?:no\.?)\s?(\d*)[-|/]?(\d*)?/gi
  ]

  let volumesFound = false
  let volumes
  // loop through regular expressions
  regExp.forEach((exp) => {
    // we only want to match on one type of regular expression to avoid
    // weirdness with field tag vs that have vol. and no.
    if (!volumesFound) {
      // convert regexp iterator into array so we can get successive matches a
      const matches = [...fieldTagV.matchAll(exp)]
      volumes = matches.reduce((vols, match) => {
        // extract the numbers from regex array-like object
        match = match.slice(1, 3)
          // Eliminate null valuesconvert from string to int
          .filter(m => m)
          // convert from string to int
          .map(m => parseInt(m, 10))
        if (match.length) volumesFound = true
        // [6,7,8] ==> [6,8]
        if (match.length > 2) match = [match[0], match[match.length - 1]]
        if (match.length === 1) match = [match[0], match[0]]
        return [...vols, match]
      }, [])
    }
  })
  return volumes
}
