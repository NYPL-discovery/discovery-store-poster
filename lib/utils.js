
const fs = require('fs')
const node_path = require('path')
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

var __file_cache = {}

const readJson = (path, opts) => {
  opts = opts || {}
  opts = Object.assign({ cache: false }, opts)

  var cacheKey = `readJson:${path}`
  if (opts.cache && __file_cache[cacheKey]) return Promise.resolve(__file_cache[cacheKey])

  var fs = require('fs')
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, data) => {
      if (err) reject(err)
      else {
        data = JSON.parse(data)
        if (opts.cache) __file_cache[cacheKey] = data
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
    var dir = node_path.dirname(path)
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

module.exports = { readJson, capitalize, writeFile, flattenArray, lpad, lineCount, compact, groupBy }
