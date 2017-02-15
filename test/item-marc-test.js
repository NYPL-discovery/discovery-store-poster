/* global describe it */

const assert = require('assert')
const itemSerializer = require('./../lib/serializers/item')
const ItemSierraRecord = require('./../lib/models/item-sierra-record')
const Item = require('./../lib/models/item')

describe('Item Marc Mapping', function () {
  this.timeout(1000)

  describe('Parse', function () {
    it('should extract certain basic item props', function () {
      var item = ItemSierraRecord.from(require('./data/item-10781594.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdf:type'), 'bf:Item')
          assert.equal(item.objectId('nypl:owner'), 'orgs:1000')
          assert.equal(item.objectId('bf:status'), 'status:a')
          assert.equal(item.objectId('nypl:holdingLocation'), 'loc:rc2sl')
          // Yeah i guess that's the actual call number?
          assert.equal(item.literal('nypl:shelfMark'), 'TPB (International Railway Congress. (VII) Washington, 1905. Summary of proceedings)')
          assert.equal(item.objectId('nypl:catalogItemType'), 'catalogItemType:66')
          assert.equal(item.objectId('nypl:bnum'), 'urn:bnum:b13689507')
        })
    })
  })

  describe('Parse opac message', function () {
    var item = ItemSierraRecord.from(require('./data/item-10008083.json'))

    it('should extract opac message', function () {
      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdf:type'), 'bf:Item')
          assert.equal(item.objectId('nypl:owner'), 'orgs:1000')
          assert.equal(item.objectId('bf:status'), 'status:a')
          assert.equal(item.objectId('nypl:holdingLocation'), 'loc:rcma2')
          assert.equal(item.objectId('nypl:catalogItemType'), 'catalogItemType:55')
          assert.equal(item.objectId('nypl:accessMessage'), 'accessMessage:2')
          assert.equal(item.statement('nypl:accessMessage').object_label, 'ADV REQUEST')
        })
    })

    it('should extract delivery locations', function () {
      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          // Look for a few known delivery locations for this location:
          var deliveryLocations = item.objectIds('nypl:deliveryLocation')
          assert(deliveryLocations.indexOf('loc:map') >= 0)
          assert(deliveryLocations.indexOf('loc:mag') >= 0)
          assert(deliveryLocations.indexOf('loc:maf') >= 0)
        })
    })
  })

  describe('Parse catalogItemType', function () {
    it('should identify branch item', function () {
      var item = ItemSierraRecord.from(require('./data/item-23971415.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdf:type'), 'bf:Item')
          assert.equal(item.objectId('nypl:bnum'), 'urn:bnum:b17355748')
          assert.equal(item.objectId('nypl:catalogItemType'), 'catalogItemType:101')
          // Make sure no other statements are being saved for this item because it's branch
          assert.equal(item.objectId('nypl:owner'), null)
          assert.equal(item.objectId('dcterms:title'), null)
          assert.equal(item.objectId('bf:status'), null)
          assert.equal(item.objectId('nypl:holdingLocation'), null)
        })
    })
  })

  describe('Determine requestable/availability', function () {
    it('Ensure requestable', function () {
      var item = ItemSierraRecord.from(require('./data/item-10008083.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('nypl:holdingLocation'), 'loc:rcma2')
          assert.equal(item.objectId('bf:status'), 'status:a')
          assert.equal(item.objectId('nypl:accessMessage'), 'accessMessage:2')

          assert.equal(item.literal('nypl:requestable'), true)
        })
    })

    it('Ensure NOT requestable', function () {
      // test/data/item-10008083.json test/data/item-10781594.json  test/data/item-23971415.json  test/data/item-pul-189241.json
      var item = ItemSierraRecord.from(require('./data/item-10781594.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('nypl:holdingLocation'), 'loc:rc2sl')
          assert.equal(item.objectId('bf:status'), 'status:a')
          assert.equal(item.objectId('nypl:accessMessage'), 'accessMessage:u')

          assert.equal(item.literal('nypl:requestable'), false)
        })
    })
  })

  describe('Parse princeton item', function () {
    it('should assign correct PUL fields', function () {
      var item = ItemSierraRecord.from(require('./data/item-pul-189241.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          // TODO need to check a whole bunch more fields...
          assert.equal(item.objectId('rdf:type'), 'bf:Item')
          assert.equal(item.objectId('nypl:bnum'), 'urn:bnum:pb176961')
          // No item types currently assigned to PUL/CUL
          assert.equal(item.objectId('nypl:catalogItemType'), null)
          assert.equal(item.objectId('nypl:owner'), 'orgs:0003')
          assert.equal(item.objectId('bf:status'), 'status:a')
        })
    })
  })
})
