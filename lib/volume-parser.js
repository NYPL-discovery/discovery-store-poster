exports.parseVolume = (fieldTagV) => {
  const regExp = [/(?:^|\s)(?:volume|vol\.?|v\.?)\s?(\d*)[-|/]?(\d*)?/gi, /(?:^|\s)(?:no\.?)\s?(\d*)[-|/]?(\d*)?/gi, /(?:^|\s)(?:bd\.?)\s?(\d*)[-|/]?(\d*)?/gi, /(?:^|\s)(?:reel|r\.?)\s?(\d*)[-|/]?(\d*)?/gi, /(?:^|\s)(?:reel|r\.?)\s?(\d*)[-|/]?(\d*)?/gi]

  let volumes = []

  let regExpIndex = 0
  // If volumes is not populated yet, and there are still more regular expressions to try, try them
  while (volumes.length === 0 && regExpIndex < (regExp.length - 1)) {
    let matches
    // This is some JS regex magic that I found on MDN.
    while ((matches = regExp[regExpIndex].exec(fieldTagV)) !== null) {
      // First element is match group, we don't want that
      let match = matches.slice(1)
      match = match
        .filter(num => num)
        .map((num) => parseInt(num, 10))
      // [6] ==> [6,6]
      if (match.length === 1) match[1] = match[0]
      // [6,7,8] ==> [6,8]
      if (match.length > 2) match = [match[0], match[match.length - 1]]
      volumes.push(match)
    }
    regExpIndex++
  }
  // [[6,7]] ==> [6,7]
  if (volumes.length === 1) volumes = volumes[0]
  return volumes
}
