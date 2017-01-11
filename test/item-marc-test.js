/* global describe it */

const assert = require('assert')
const itemSerializer = require('./../lib/serializers/item')
const SierraRecord = require('./../lib/models').SierraRecord
const Item = require('./../lib/models/item')

describe('Item Marc Mapping', function () {
  this.timeout(1000)

  describe('Parse', function () {
    it('should extract certain basic item props', function () {
      var item = SierraRecord.from(require('./data/item-10781594.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdf:type'), 'nypl:Item')
          assert.equal(item.objectId('nypl:owner'), 'orgs:1000')
          assert.equal(item.objectId('bf:status'), 'status:a')
          assert.equal(item.objectId('nypl:physicalLocation'), 'loc:rc2sl')
          // Yeah i guess that's the actual call number?
          assert.equal(item.literal('nypl:shelfMark'), 'TPB (International Railway Congress. (VII) Washington, 1905. Summary of proceedings)')
          assert.equal(item.objectId('nypl:itemType'), 'urn:itemtype:research')
          assert.equal(item.objectId('nypl:bnum'), 'urn:bnum:b13689507')
        })
    })
  })

  describe('Parse opac message', function () {
    it('should extract opac message', function () {
      var item = SierraRecord.from(require('./data/item-10008083.json'))
      console.log('item: ', item)

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdf:type'), 'nypl:Item')
          assert.equal(item.objectId('nypl:owner'), 'orgs:1000')
          assert.equal(item.objectId('bf:status'), 'status:a')
          assert.equal(item.objectId('nypl:physicalLocation'), 'loc:rcma2')
          assert.equal(item.objectId('nypl:itemType'), 'urn:itemtype:research')
        })
    })
  })
})
