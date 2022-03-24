
const fs = require('fs')
const nodePath = require('path')
const mkdirp = require('mkdirp')

const groupBy = (a, prop) => {
  var grouped = a.reduce((grouped, item) => {
    var val = item[prop]

    if (!grouped[val]) grouped[val] = []
    grouped[val].push(item)

    return grouped
  }, {})

  return Object.keys(grouped).map((v) => grouped[v])
}

const lineCount = (path) => {
  return new Promise((resolve, reject) => {
    // Oy it is not easy to get a simple line count in node..
    // From http://stackoverflow.com/questions/12453057/node-js-count-the-number-of-lines-in-a-file
    var i
    var count = 0
    fs.createReadStream(this.path)
      .on('data', function (chunk) {
        for (i = 0; i < chunk.length; ++i) {
          if (chunk[i] === 10) count++
        }
      })
      .on('end', function () {
        console.log('line count for ', path, count)
        resolve(count)
      })
  })
}

const lpad = (value, length, chr) => {
  return (value.toString().length < length) ? lpad(chr + value, length, chr) : value
}

var __fileCache = {}

const readJson = (path, opts) => {
  opts = opts || {}
  opts = Object.assign({ cache: false }, opts)

  var cacheKey = `readJson:${path}`
  if (opts.cache && __fileCache[cacheKey]) return Promise.resolve(__fileCache[cacheKey])

  var fs = require('fs')
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, data) => {
      if (err) reject(err)
      else {
        try {
          data = JSON.parse(data)
        } catch (e) {
          console.error('Error parsing ' + path)
          data = {}
        }
        if (opts.cache) __fileCache[cacheKey] = data
        resolve(data)
      }
    })
  })
}

const capitalize = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

const writeFile = (path, str, opts) => {
  opts = opts || {}
  opts = Object.assign({
    create_directories: true
  }, opts)

  return new Promise((resolve, reject) => {
    var dir = nodePath.dirname(path)
    mkdirp(dir, (err) => {
      if (err) return reject(err)

      fs.writeFile(path, str, (err) => {
        if (err) reject(err)
        else resolve(str)
      })
    })
  })
}

const flattenArray = (arrays) => {
  return [].concat.apply([], arrays)
}

// Filter on truthy
const compact = (a) => {
  return a.filter((i) => i)
}

const truncate = (s, len, indicator = '...') => {
  if (s.length <= len) return s
  else return s.substring(0, len - indicator.length) + indicator
}

/**
 * Returns the first matching entity in the given mapping hash that has a matching `code`
 * For use with nypl-core-objects mappings
 *
 * @example
 * // Returns the status entity matching code 'a':
 * coreObjectsMappingByCode(require('@nypl/nypl-core-objects')('by-statuses'), 'a')
 */
const coreObjectsMappingByCode = (mapping, code) => {
  // Reduce to values:
  return Object.keys(mapping)
    .map((id) => mapping[id])
    // Filter on matching code:
    .filter((org) => org.code === code)
    // Return first:
    .shift()
}

/**
 * Given a subjectId (e.g. "b1234", "b1234#1.001"), returns the same subjectId
 * without any "internal" blanknode suffix.
 *
 * @param {string} subjectId - A subject id
 *
 * @returns {string} The id without any '#' suffix
 *
 * @example
 * // The following returns "b1234"
 * baseSubjectId("b1234#1.001")
 */
const baseSubjectId = (subjectId) => {
  return subjectId.replace(/#.*$/, '')
}

/**
 * Simple implementation of distinct.
 *
 * Beware: Uses Object.keys, so result is string[] regardless of input.
 */
const distinctStrings = (a) => Object.keys(a.reduce((m, i) => Object.assign(m, { [i]: true }), {}))

/**
 * Given an array of Statement instances, returns the distinct subject_ids
 *
 * @param {Array<Statement>} statements - An array of Statement instances
 *
 * @returns {Array<string>} An array of distinct subject_ids
 */
const distinctSubjectIds = (statements) => {
  return distinctStrings(
    statements
      .map((s) => s.subject_id)
      .map(baseSubjectId)
  )
}

/**
 * Given an array of objects, removes elements from the end for which the cb
 * returns `true`
 *
 * @example
 * // The following returns ['one', 'two']:
 * removeTrailingEmptyStrings(['one', 'two', '', ''], (v) => v === '')
 *
 */
const removeTrailingElementsMatching = (a, cb) => {
  while (a.length && cb(a[a.length - 1])) {
    a.pop()
  }

  return a
}

module.exports = { readJson, capitalize, writeFile, flattenArray, lpad, lineCount, compact, groupBy, coreObjectsMappingByCode, truncate, baseSubjectId, distinctSubjectIds, removeTrailingElementsMatching }
