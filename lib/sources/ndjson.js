'use strict'

const fs = require('fs')
// const ndjson = require('ndjson')
const H = require('highland')
const lineCount = require('../utils').lineCount

class NdJsonSource {
  constructor (path) {
    this.path = path
  }

  count () {
    return lineCount(this.path)
  }

  stream () {
    return H(fs.createReadStream(this.path))
      .split()
      .compact()
      .map(JSON.parse)
      .map((bib) => Object.assign(bib, {
        nyplSource: 'sierra-nypl'
      }))

  //  var source = fs.createReadStream(this.path)
  //    .pipe(ndjson.parse())
  //  return highland('data', source, (obj) => obj)
   //   .map((bib) => {
    //    bib.nyplSource = 'sierra-nypl'
    //    return bib
  //    })
  }
}

module.exports = NdJsonSource
