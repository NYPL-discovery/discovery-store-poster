
const fs = require('fs')
const node_path = require('path')
const mkdirp = require('mkdirp')
const csv = require('fast-csv')
// const log = require('loglevel')
// const redis_client = require('./redis-client')

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

const readCsv = (path) => {
  var cacheKey = `readCsv:${path}`
  if (__file_cache[cacheKey]) return Promise.resolve(__file_cache[cacheKey])

  return new Promise((resolve, reject) => {
    var rows = []

    fs.createReadStream(path)
      .pipe(csv())
      .on('data', (data) => {
        rows.push(data)
      })
      .on('end', () => {
        __file_cache[cacheKey] = rows
        resolve(rows)
      })
  })
}

/*
// Given an array of image urls, returns a Promise that resolves the biggest among them in px
// Uses db.images as a cache
const biggestImage = (urls) => {
  return Promise.all(urls.map(imageDimensionsCached)).then((sizes) => {
    // console.log('consider image sizes: ', sizes)
    return sizes.filter((s) => s.dimensions).sort((s1, s2) => {
      if (s1.dimensions.width * s1.dimensions.height > s2.dimensions.width * s2.dimensions.height) return 1
      return -1
    })[0]
  })
}

const imageDimensionsCached = (url) => {
  return imageDimensionsByRedis(url).catch(() => {
    return imageDimensions(url).then((dimensions) => {
      return redis_client.setAsync(`image.dimensions:${url}`, JSON.stringify(dimensions)).then(() => dimensions)
    })
  })
}

const imageDimensionsByRedis = (url) => {
  return redis_client.getAsync(`image.dimensions:${url}`).then((dim) => {
    if (dim) dim = JSON.parse(dim)

    if (!dim) return Promise.reject()
    else return JSON.parse(dim)
  })
}

const imageDimensions = (imageUrl) => {
  var http = require('http')
  var imagesize = require('imagesize')
  return new Promise((resolve, reject) => {
    try {
      log.debug('Utils#imageDimensions:', imageUrl)
      // log.info('Utils#imageDimensions:', imageUrl)
      console.time('request: ' + imageUrl)
      var request = http.get(imageUrl, function (response) {
        imagesize(response, function (err, result) {
          // we don't need more data
          request.abort()

          console.timeEnd('request: ' + imageUrl)
          if (err) return resolve({url: imageUrl, error: err})
          else return resolve({url: imageUrl, dimensions: result})
        })
      }).on('error', (e) => {
        console.log(`HTTP error: ${e.message}`)
        return resolve({url: imageUrl, error: e.message})
      })
      // log.info('  Utils#imageDimensions: done', imageUrl)
    } catch (err) {
      // I think we wind up here if the URL simply doesn't resolve or we get a 4** /5** response?
      return resolve({url: imageUrl, error: err})
    }
  })
}
*/

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

module.exports = { readJson, readCsv, capitalize, writeFile, flattenArray, lpad, lineCount, compact, groupBy }
