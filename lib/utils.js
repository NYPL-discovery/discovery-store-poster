
const fs = require('fs')
const node_path = require('path')
const mkdirp = require('mkdirp')
const csv = require('fast-csv')
const log = require('loglevel')

const readJson = (path) => {
  var fs = require('fs')
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, data) => {
      if (err) reject(err)
      else resolve(JSON.parse(data))
    })
  })
}

const readCsv = (path) => {
  return new Promise((resolve, reject) => {
    var rows = []

    fs.createReadStream(path)
      .pipe(csv())
      .on('data', (data) => {
        rows.push(data)
      })
      .on('end', () => {
        resolve(rows)
      })
  })
}

const imageDimensions = (imageUrl) => {
  var http = require('http')
  var imagesize = require('imagesize')

  return new Promise((resolve, reject) => {
    try {
      log.debug('Utils#imageDimensions:', imageUrl)
      var request = http.get(imageUrl, function (response) {
        imagesize(response, function (err, result) {
          // we don't need more data
          request.abort()

          if (err) return resolve({url: imageUrl, error: err})
          else return resolve({url: imageUrl, dimensions: result})
        })
      })
    } catch (err) {
      // I think we wind up here if the URL simply doesn't resolve or we get a 4**/5** response?
      return resolve({url: imageUrl, error: err})
    }
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

module.exports = { readJson, readCsv, imageDimensions, capitalize, writeFile, flattenArray }
