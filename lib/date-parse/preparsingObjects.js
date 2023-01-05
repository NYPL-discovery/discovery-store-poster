const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June?', 'July?', 'Aug', 'Sept?', 'Oct', 'Nov', 'Dec']
const monthPattern = `(${monthNames.join('|')}).?`
const seasonNames = ['Win(ter)?', '(Autumn|Fall?)', 'Spr(ing)?', 'Sum(mer)?']
const seasonPattern = `(${seasonNames.join('|')}).?`
const monthOrSeasonPattern = `(${monthPattern}|${seasonPattern})`
/**
 * These are objects with regex expressions and transform functions used to preparse
 * date strings before they are sent to the date parse lambda
 */
const objects = {
  // Extract values from inside parentheses; v. 5 (August 1990)
  parens: {
    matchExpression: /\((.+)\)/,
    transform: function (range) {
      const match = range.match(this.matchExpression)
      if (match[1] === 'second copy') {
        return range.replace('(second copy)', '')
      } else {
        return match[1]
      }
    },
    exampleString: 'v. 5 (August 1990)'
  },

  // 1992:spring

  colon: {
    matchExpression: new RegExp(`\\d{4}:${monthOrSeasonPattern}`, 'i'),
    transform: function (range) {
      return range.split(':')[1] + ' ' + range.split(':')[0]
    },
    exampleString: '1992:spring'
  },

  // 1991/1992, but only if it is the only date range in the string
  soloRangeSlash: {
    matchExpression: /(?<!(?:no|v)\.?\s?)(?:^|\s|-)\d{4}\/(\d{4}|\d{2})/g,
    transform: function (range) {
      const rangeMatch = range.match(this.matchExpression)
      return rangeMatch[0].replace(/\//, '-')
    },
    exampleString: '1991/1992'
  },

  // 1956/57-1981/82
  twoYearRangeMulti: {
    matchExpression: /(?<!(no|v)\.\s?)\d{4}\/(\d{4}|\d{2})-\d{4}\/(\d{4}|\d{2})/gi,
    transform: (ranges) => {
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
    exampleString: '1956/57-1981/82'
  },

  // addressing mysterious bug in timetwister that causes null values for XX0X-0X ranges
  shortYearBug: {
    matchExpression: /(\d{4})-(0\d)/,
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
    transform: function (range) {
      return range.replace(this.matchExpression, '')
    },
    exampleString: ' May-June/July 1963, Oct. 1961-Sept./Oct. 1962'
  },

  // 1895-1896/1897
  yearRangeWithSlash: {
    matchExpression: /(?<!(?:no|v)\.\s?)(\d{4}-)\d{4}\/(\d{4})/,
    transform (range) {
      const years = range.match(this.matchExpression)
      return years[1] + years[2]
    },
    exampleString: '1895-1896/1897'
  }
}

module.exports = {
  preparsingObjects: objects,
  returnOneYear
}
