/* global describe it */

// var request = require('request')
const assert = require('assert')
const MarcMapping = require('./../lib/field-mapping').MarcMapping

describe('Marc Mapping', function () {
  this.timeout(1000)

  describe('Parse', function () {
    it('should parse marc mapping', function () {
      return MarcMapping.initialize().then(function (mapping) {
        assert(true)
        return Promise.resolve()
      })
    })
  })
})

