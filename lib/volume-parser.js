exports.parseVolume = (fieldTagV) => {
  const matchVolumeNumbers = /(^|\s)(?:volume|vol\.?|v\.?)\s?(\d*)[-|/]?(\d*)?/gi
  let volumes = []
  let matches
  while ((matches = matchVolumeNumbers.exec(fieldTagV)) !== null) {
    let match = matches.slice(1)
    // [6,7,8] ==> [6,8]
    match = match
      .filter(num => num)
      .map((num) => parseInt(num, 10))
      // [6] ==> [6,6]
    if (match.length === 1) match[1] = match[0]
    if (match.length > 2) match = [match[0], match[match.length - 1]]
    volumes.push(match)
  }
  // [[6,7]] ==> [6,7]
  if (volumes.length === 1) volumes = volumes[0]
  return volumes
}
