
const fs = require('fs')
const csv = require('fast-csv')

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
    // console.log('requesting: ', imageUrl)
    var request = http.get(imageUrl, function (response) {
      imagesize(response, function (err, result) {
        // we don't need more data
        request.abort()

        if (err) return resolve({url: imageUrl, error: err})
        else return resolve({url: imageUrl, dimensions: result})
      })
    })
  })
}

module.exports = { readCsv, imageDimensions }
