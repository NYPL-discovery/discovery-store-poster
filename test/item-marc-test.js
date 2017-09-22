/* global describe it */

const assert = require('assert')
const itemSerializer = require('./../lib/serializers/item')
const ItemSierraRecord = require('./../lib/models/item-sierra-record')
const Item = require('./../lib/models/item')
const buildMapper = require('./../lib/field-mapper')

/**
 * Given an object (bib or item marc-in-json object)
 *
 * @return {object} Copy of given object with modified subfield content
 */
function changeSubField (object, marcTag, subfieldTag, newContent) {
  // Deep copy object:
  object = JSON.parse(JSON.stringify(object))

  object.varFields = object.varFields.map((f) => {
    if (String(f.marcTag) === String(marcTag)) {
      f.subFields = f.subFields.map((s) => {
        if (String(s.tag) === String(subfieldTag)) {
          s.content = newContent
        }
        return s
      })
    }
    return f
  })
  return object
}

describe('Item Marc Mapping', function () {
  this.timeout(1000)

  describe('Parse', function () {
    it('parses deleted as suppressed', function () {
      let item = ItemSierraRecord.from(require('./data/item-10781594-deleted.json'))
      assert(item.deleted, true)
      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.literal('nypl:suppressed'), true)
        })
    })

    it('should parse marc mapping for sierra-nypl', function () {
      var mapper = buildMapper('item', 'sierra-nypl')

      var mapping = mapper.getMapping('Availability')
      assert.equal(mapping.paths.length, 1)
      assert.equal(mapping.paths[0].marc, 'status')
    })

    it('should parse marc mapping differently for recap-pul', function () {
      var mapper = buildMapper('item', 'recap-pul')

      var mapping = mapper.getMapping('Availability')
      assert.equal(mapping.paths.length, 2)
      assert.equal(mapping.paths[1].marc, '876')
    })

    it('should extract certain basic item props', function () {
      var item = ItemSierraRecord.from(require('./data/item-10781594.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdfs:type'), 'bf:Item')
          assert.equal(item.objectId('nypl:owner'), 'orgs:1000')
          // This one happens to have a [faked] duedate, so will appear unavailable:
          assert.equal(item.objectId('bf:status'), 'status:co')
          assert.equal(item.objectId('nypl:holdingLocation'), 'loc:rc2sl')
          // Yeah i guess that's the actual call number?
          assert.equal(item.literal('nypl:shelfMark'), 'TPB (International Railway Congress. (VII) Washington, 1905. Summary of proceedings) v. 2')
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
          assert.equal(item.objectId('rdfs:type'), 'bf:Item')
          assert.equal(item.objectId('nypl:owner'), 'orgs:1000')
          assert.equal(item.objectId('bf:status'), 'status:a')
          assert.equal(item.objectId('nypl:holdingLocation'), 'loc:rcma2')
          assert.equal(item.objectId('nypl:catalogItemType'), 'catalogItemType:55')
          assert.equal(item.objectId('nypl:accessMessage'), 'accessMessage:2')
          assert.equal(item.statement('nypl:accessMessage').object_label, 'Request in advance')
        })
    })
  })

  describe('Parse catalogItemType', function () {
    it('should identify branch item', function () {
      var item = ItemSierraRecord.from(require('./data/item-23971415.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdfs:type'), 'bf:Item')
          assert.equal(item.objectId('nypl:bnum'), 'urn:bnum:b17355748')
          assert.equal(item.literal('nypl:suppressed'), true)
          // Make sure no other statements are being saved for this item because it's branch
          assert.equal(item.objectId('nypl:catalogItemType'), null)
          assert.equal(item.objectId('nypl:owner'), null)
          assert.equal(item.objectId('dcterms:title'), null)
          assert.equal(item.objectId('bf:status'), null)
          assert.equal(item.objectId('nypl:holdingLocation'), null)
          assert.equal(item.literal('nypl:shelfMark'), null)
        })
    })

    it('should identify research item with specific itype > 100', function () {
      var item = ItemSierraRecord.from(require('./data/item-23937039.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdfs:type'), 'bf:Item')
          assert.equal(item.objectId('nypl:bnum'), 'urn:bnum:b17664294')
          assert.equal(item.literal('nypl:suppressed'), false)
          // itypes greater than 100 are normally non-research, but some are research!
          assert.equal(item.objectId('nypl:catalogItemType'), 'catalogItemType:132')
          assert.equal(item.objectId('nypl:owner'), 'orgs:1002')
          assert.equal(item.objectId('bf:status'), 'status:a')
          assert.equal(item.objectId('nypl:holdingLocation'), 'loc:rcpr2')
          assert.equal(item.literal('nypl:shelfMark'), 'M16 3584 W')
        })
    })
  })

  describe('requestability parsing', function () {
    it('should identify an NYPL item that is requestable', function () {
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

    it('should identify an NYPL item that is NOT requestable because checked out', function () {
      var item = ItemSierraRecord.from(require('./data/item-10781594.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('nypl:holdingLocation'), 'loc:rc2sl')
          assert.equal(item.objectId('bf:status'), 'status:co')
          assert.equal(item.objectId('nypl:accessMessage'), 'accessMessage:u')

          assert.equal(item.literal('nypl:requestable'), false)
        })
    })

    it('should check pul 876 $j to determine available & requestable', function () {
      var item = ItemSierraRecord.from(require('./data/item-pul-189241.json'))

      // Confirm object is available and requestable:
      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('bf:status'), 'status:a')
          assert.equal(item.literal('nypl:requestable'), true)
        })
    })

    it('should check pul 876 $j to determine NOT available & NOT requestable', function () {
      var item = require('./data/item-pul-189241.json')

      // Change status to not-available:
      item = changeSubField(item, '876', 'j', 'Not available')
      item = ItemSierraRecord.from(item)

      // Confirm it's now not available nor requestable
      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('bf:status'), 'status:na')
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
          assert.equal(item.objectId('rdfs:type'), 'bf:Item')
          assert.equal(item.objectId('nypl:bnum'), 'urn:bnum:pb176961')
          // No item types currently assigned to PUL/CUL
          assert.equal(item.objectId('nypl:catalogItemType'), 'catalogItemType:1')
          assert.equal(item.objectId('nypl:owner'), 'orgs:0003')
          assert.equal(item.objectId('bf:status'), 'status:a')
          assert.equal(item.literal('nypl:requestable'), true)
          // No restrictions:
          assert.equal(item.objectId('nypl:accessMessage'), 'accessMessage:1')
          assert.equal(item.literal('nypl:suppressed'), false)
        })
    })
  })

  describe('Item carrier, media type', function () {
    it('should assign correct carrier, media types based on item type', function () {
      var item = ItemSierraRecord.from(require('./data/item-10003973.json'))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdfs:type'), 'bf:Item')
          assert.equal(item.objectId('nypl:bnum'), 'urn:bnum:b10006965')
          assert.equal(item.objectId('nypl:catalogItemType'), 'catalogItemType:6')
          assert.equal(item.objectId('nypl:owner'), 'orgs:1000')
          assert.equal(item.literal('nypl:requestable'), true)
          assert.equal(item.objectId('bf:media'), 'mediatypes:h')
          assert.equal(item.objectId('bf:carrier'), 'carriertypes:hd')
        })
    })
  })

  describe('Item suppression rules', function () {
    it('should suppress item based on 876 $x', function () {
      // Let's add 876 $x 'Private' to this recap item to confirm it becomes suppressed:
      var item = ItemSierraRecord.from(require('./data/item-pul-189241.json'))
      item.varFields
        .filter((f) => f.marcTag === '876')
        .forEach((f) => f.subFields.push({ tag: 'x', content: 'Private' }))

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdfs:type'), 'bf:Item')
          assert.equal(item.literal('nypl:suppressed'), true)

          // Because we modified the object, clear require cache
          delete require.cache[require.resolve('./data/item-pul-189241.json')]
        })
    })

    it('should suppress item based on 900 $a', function () {
      // Let's set 900 $a to 'Private' to this recap item to confirm it becomes suppressed:
      var item = ItemSierraRecord.from(require('./data/item-pul-189241.json'))
      item.varFields
        .filter((f) => f.marcTag === '900')
        .forEach((f) => {
          // Modify the $a subField (currently "Shared"):
          f.subFields.forEach((subField) => {
            if (subField.tag === 'a') subField.content = 'Private'
          })
        })

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdfs:type'), 'bf:Item')
          assert.equal(item.literal('nypl:suppressed'), true)

          // Because we modified the object, clear require cache
          delete require.cache[require.resolve('./data/item-pul-189241.json')]
        })
    })

    it('should suppress item based on fixed "Item Type"', function () {
      // Amend this item to have Item Type '50'
      var item = require('./data/item-10003973.json')
      item.fixedFields
        .filter((f) => f.label === 'Item Type')
        .forEach((f) => {
          f.value = '50'
        })
      item = ItemSierraRecord.from(item)

      return itemSerializer.fromMarcJson(item)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.equal(item.objectId('rdfs:type'), 'bf:Item')
          // Note we can't check 'nypl:catalogItemType' because almost nothing apart form nypl:suppressed is being serialized
          assert.equal(item.literal('nypl:suppressed'), true)

          // Because we modified the object, clear require cache
          delete require.cache[require.resolve('./data/item-10003973.json')]
        })
    })

    it('should suppress item based on fixed "Item Code 2"', function () { // Amend this item to have Item Code 2 any of four '50'
      var item = require('./data/item-10003973.json')
      return Promise.all(['-', 's', 'w', 'd', 'p'].map((code) => {
        // Set Item Code 2 to code
        item.fixedFields
          .filter((f) => f.label === 'Item Code 2')
          .forEach((f) => {
            f.value = code
          })
        item = ItemSierraRecord.from(item)

        return itemSerializer.fromMarcJson(item)
          .then((statements) => new Item(statements))
          .then((item) => {
            assert.equal(item.objectId('rdfs:type'), 'bf:Item')
            // Of the five values we setting, only '-' should cause item to be not suppressed
            assert.equal(item.literal('nypl:suppressed'), code !== '-')

            // Because we modified the object, clear require cache
            delete require.cache[require.resolve('./data/item-10003973.json')]
          })
      }))
    })
  })
})
