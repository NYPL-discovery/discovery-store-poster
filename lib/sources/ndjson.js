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
    // return H(fs.createReadStream(this.path))
    return H([this.path])
      .split()
      .compact()
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
