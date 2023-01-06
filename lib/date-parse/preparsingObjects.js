/**
 * These are objects with regex expressions and transform functions used to preparse
 * date strings before they are sent to the date parse lambda
 */

const getAllFourDigitYears = {
  matchExpression: /\b(\d{4})\b/g,
  yearTransform (range) {
    const years = [...range.matchAll(this.matchExpression)]
    if (!years.length) {
      return []
    } else if (years.length === 1) {
      return [[years[0][1], years[0][1]]]
    } else if (years.legnth === 2) {
      return [years.map(year => year[1])]
    } else return [[years[0][1], years[years.length - 1][1]]]
  }
}

const theOnlyYearParsingWeNeed = {
  matchExpression: /\b((?:16|17|18|19|20)\d{2})[-|/](\d{2})\b/g,
  yearTransform (range) {
    const years = [...range.matchAll(this.matchExpression)]
    const prefix = years[0][0].slice(0, 2)
    let secondYear
    if (years.length === 1) {
      secondYear = years[0][2]
    } else {
      secondYear = years[years.length - 1][2]
    }
    return years[0][1] + '-' + prefix + secondYear
  }
}

// If timetwister returns null values, try to return a date
const returnOneYear = {
  matchExpression: /(?:16|17|18|19|20)\d{2}/,
  yearTransform (range) { return range },
  transform: function (range) {
    const match = range.match(this.matchExpression)
    if (match) {
      return match[0]
    }
  }
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June?', 'July?', 'Aug', 'Sept?', 'Oct', 'Nov', 'Dec']
const monthPattern = `(${monthNames.join('|')}).?`
const seasonNames = ['Win(ter)?', '(Autumn|Fall?)', 'Spr(ing)?', 'Sum(mer)?']
const seasonPattern = `(${seasonNames.join('|')}).?`
const monthOrSeasonPattern = `(${monthPattern}|${seasonPattern})`
/**
 * These are objects with regex expressions and transform functions used to preparse
 * date strings before they are sent to the date parse lambda.
 */
const wholeDateObjects = {
  // Extract values from inside parentheses; v. 5 (August 1990)
  parens: {
    matchExpression: /\((.+\b\d{4})\)/,
    transform: function (range) {
      const match = range.match(this.matchExpression)
      return match[1]
    },
    yearTransform (range) {
      return this.transform(range)
    },
    exampleString: 'v. 5 (August 1990)'
  },

  // 1992:spring

  colon: {
    matchExpression: new RegExp(`\\d{4}:${monthOrSeasonPattern}`, 'i'),
    transform (range) {
      return range.split(':')[1] + ' ' + range.split(':')[0]
    },
    yearTransform (range) {
      return [[range.split(':')[0], range.split(':')[0]]]
    },
    exampleString: '1992:spring'
  },

  // 1956/57-1981/82
  twoYearRangeMulti: {
    matchExpression: /(?<!(no|v)\.\s?)\d{4}\/(\d{4}|\d{2})-\d{4}\/(\d{4}|\d{2})/gi,
    transform (ranges) {
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
    },
    yearTransform (range) {
      return this.transform(range)
    },
    exampleString: '1956/57-1981/82'
  },
  // 1895-1896/1897
  yearRangeWithSlash: {
    matchExpression: /(?<!(?:no|v)\.\s?)(\d{4}-)\d{4}\/(\d{4})/,
    yearTransform (range) {
      return this.transform(range)
    },
    transform (range) {
      const years = range.match(this.matchExpression)
      return years[1] + years[2]
    },
    exampleString: '1895-1896/1897'
  },

  // 1991/1992 or 1991/92 but only if it is the only date range in the string
  soloRangeSlash: {
    matchExpression: /(?<!(?:no|v)\.?\s?)(?:^|\s|-)\d{4}\/(\d{4}|\d{2})/g,
    yearTransform (range) {
      return this.transform(range)
    },
    transform: function (range) {
      const rangeMatch = range.match(this.matchExpression)
      return rangeMatch[0].replace(/\//, '-')
    },
    exampleString: '1991/1992'
  },

  // addressing mysterious bug in timetwister that causes null values for XX0X-0X ranges
  shortYearBug: {
    matchExpression: /(\d{4})-(0\d)/,
    yearTransform (range) { return range },
    transform: function (range) {
      const shortYear = range.match(this.matchExpression)[2]
      const century = range.match(/^\d{2}/)[0]
      return range.replace(/(?<=-)(0\d)/, century + shortYear)
    },
    exampleString: 'XX0X-0X'
  },

  // month-month/month ' May-June/July 1963,  Oct. 1961-Sept./Oct. 1962'
  monthRangeWithSlash: {
    matchExpression: /(?<=-)[a-z]{3,4}\.?\/|\/[a-z]{3,4}\./gi,
    yearTransform (range) {
      return this.transform(range)
    },
    transform: function (range) {
      return range.replace(this.matchExpression, '')
    },
    exampleString: ' May-June/July 1963, Oct. 1961-Sept./Oct. 1962'
  },

  removeSecondCopy: {
    matchExpression: /\(second copy\)/,
    yearTransform (range) { return this.transform(range) },
    transform: function (range) {
      return range.replace('(second copy)', '')
    }
  }
}

module.exports = {
  preparsingObjects: wholeDateObjects,
  returnOneYear,
  getAllFourDigitYears,
  theOnlyYearParsingWeNeed
}
