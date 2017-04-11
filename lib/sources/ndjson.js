'use strict'

const H = require('highland')
const fs = require('fs')
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
    // return H.wrapCallback(fs.readFile)(this.path)
      .split()
      .compact()
      .map((b) => {
        // console.log('considering', b)
        return b
      })
      .map(JSON.parse)
      .map((bib) => {
        // console.log(bib)
        return Object.assign(bib, {
          nyplSource: 'sierra-nypl'
        })
      })
  }
}

module.exports = NdJsonSource
