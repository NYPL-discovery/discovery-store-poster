/* global describe it */

const assert = require('assert')
const expect = require('chai').expect
const sinon = require('sinon')

const ItemSierraRecord = require('./../lib/models/item-sierra-record')
const BibSierraRecord = require('./../lib/models/bib-sierra-record')
const Item = require('./../lib/models/item')
const buildMapper = require('./../lib/field-mapper')
const dateParse = require('../lib/date-parse')

let itemSerializer

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

  let genericBib

  before(async () => {
    itemSerializer = require('./../lib/serializers/item')
    // Ready a random bib for passing into the item serializer for the few
    // times that the item serializer needs to inspect the parent bib:
    genericBib = BibSierraRecord.from(require('./data/bib-10001936.json'))
  })

  describe('Parse', function () {
    it('parses deleted as suppressed', function () {
      const item = ItemSierraRecord.from(require('./data/item-10781594-deleted.json'))
      assert(item.deleted, true)
      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.literal('nypl:suppressed'), true)
        })
    })

    it('should parse marc mapping for sierra-nypl', function () {
      var mapper = buildMapper('item', 'sierra-nypl')

      var mapping = mapper.getMapping('Availability')
      assert.strictEqual(mapping.paths.length, 1)
      assert.strictEqual(mapping.paths[0].marc, 'status')
    })

    it('should parse marc mapping differently for recap-pul', function () {
      var mapper = buildMapper('item', 'recap-pul')

      var mapping = mapper.getMapping('Availability')
      assert.strictEqual(mapping.paths.length, 2)
      assert.strictEqual(mapping.paths[1].marc, '876')
    })

    it('should extract certain basic item props', function () {
      var item = ItemSierraRecord.from(require('./data/item-10781594.json'))

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
          assert.strictEqual(item.objectId('nypl:owner'), 'orgs:1000')
          // This one happens to have a [faked] duedate, so will appear unavailable:
          assert.strictEqual(item.objectId('bf:status'), 'status:co')
          assert.strictEqual(item.objectId('nypl:holdingLocation'), 'loc:rc2sl')
          // Yeah i guess that's the actual call number?
          assert.strictEqual(item.literal('nypl:shelfMark'), 'TPB (International Railway Congress. (VII) Washington, 1905. Summary of proceedings) v. 2')
          assert.strictEqual(item.literal('bf:physicalLocation'), 'TPB (International Railway Congress. (VII) Washington, 1905. Summary of proceedings)')
          assert.strictEqual(item.literal('bf:enumerationAndChronology'), 'v. 2')
          assert.strictEqual(item.objectId('nypl:catalogItemType'), 'catalogItemType:66')
          assert.strictEqual(item.objectId('nypl:bnum'), 'urn:bnum:b13689507')
        })
    })
  })

  describe('Parse opac message', function () {
    var item = ItemSierraRecord.from(require('./data/item-10008083.json'))

    it('should extract opac message', function () {
      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
          assert.strictEqual(item.objectId('nypl:owner'), 'orgs:1000')
          assert.strictEqual(item.objectId('bf:status'), 'status:a')
          assert.strictEqual(item.objectId('nypl:holdingLocation'), 'loc:rcma2')
          assert.strictEqual(item.objectId('nypl:catalogItemType'), 'catalogItemType:55')
          assert.strictEqual(item.objectId('nypl:accessMessage'), 'accessMessage:2')
          assert.strictEqual(item.statement('nypl:accessMessage').object_label, 'Request in advance')
        })
    })
  })

  describe('Parse catalogItemType', function () {
    it('should identify branch item', function () {
      var item = ItemSierraRecord.from(require('./data/item-23971415.json'))

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
          assert.strictEqual(item.objectId('nypl:bnum'), 'urn:bnum:b17355748')
          assert.strictEqual(item.literal('nypl:suppressed'), true)
          assert.strictEqual(item.objectId('nypl:catalogItemType'), 'catalogItemType:101')
          // Make sure no other statements are being saved for this item because it's branch
          assert.strictEqual(item.objectId('nypl:owner'), undefined)
          assert.strictEqual(item.objectId('dcterms:title'), undefined)
          assert.strictEqual(item.objectId('bf:status'), undefined)
          assert.strictEqual(item.objectId('nypl:holdingLocation'), undefined)
          assert.strictEqual(item.literal('nypl:shelfMark'), undefined)
        })
    })

    it('should identify research item with specific itype > 100', function () {
      var item = ItemSierraRecord.from(require('./data/item-23937039.json'))

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
          assert.strictEqual(item.objectId('nypl:bnum'), 'urn:bnum:b17664294')
          assert.strictEqual(item.literal('nypl:suppressed'), false)
          // itypes greater than 100 are normally non-research, but some are research!
          assert.strictEqual(item.objectId('nypl:catalogItemType'), 'catalogItemType:132')
          assert.strictEqual(item.objectId('nypl:owner'), 'orgs:1002')
          assert.strictEqual(item.objectId('bf:status'), 'status:a')
          assert.strictEqual(item.objectId('nypl:holdingLocation'), 'loc:rcpr2')
          assert.strictEqual(item.literal('nypl:shelfMark'), 'M16 3584 W')
        })
    })
  })

  describe('requestability parsing', function () {
    it('should identify an NYPL item that is requestable', function () {
      var item = ItemSierraRecord.from(require('./data/item-10008083.json'))

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('nypl:holdingLocation'), 'loc:rcma2')
          assert.strictEqual(item.objectId('bf:status'), 'status:a')
          assert.strictEqual(item.objectId('nypl:accessMessage'), 'accessMessage:2')

          assert.strictEqual(item.literal('nypl:requestable'), true)
        })
    })

    it('should identify an NYPL item that is NOT requestable because checked out', function () {
      var item = ItemSierraRecord.from(require('./data/item-10781594.json'))

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('nypl:holdingLocation'), 'loc:rc2sl')
          assert.strictEqual(item.objectId('bf:status'), 'status:co')
          assert.strictEqual(item.objectId('nypl:accessMessage'), 'accessMessage:u')

          assert.strictEqual(item.literal('nypl:requestable'), false)
        })
    })

    it('should check pul 876 $j to determine available & requestable', function () {
      var item = ItemSierraRecord.from(require('./data/item-pul-189241.json'))

      // Confirm object is available and requestable:
      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('bf:status'), 'status:a')
          assert.strictEqual(item.literal('nypl:requestable'), true)
        })
    })

    it('should check pul 876 $j to determine NOT available & NOT requestable', function () {
      var item = require('./data/item-pul-189241.json')

      // Change status to not-available:
      item = changeSubField(item, '876', 'j', 'Not available')
      item = ItemSierraRecord.from(item)

      // Confirm it's now not available nor requestable
      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('bf:status'), 'status:na')
          assert.strictEqual(item.literal('nypl:requestable'), false)
        })
    })
  })

  describe('Parse princeton item', function () {
    it('should assign correct PUL fields', function () {
      var item = ItemSierraRecord.from(require('./data/item-pul-189241.json'))

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          // TODO need to check a whole bunch more fields...
          assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
          assert.strictEqual(item.objectId('nypl:bnum'), 'urn:bnum:pb176961')
          // No item types currently assigned to PUL/CUL
          assert.strictEqual(item.objectId('nypl:catalogItemType'), 'catalogItemType:1')
          assert.strictEqual(item.objectId('nypl:owner'), 'orgs:0003')
          assert.strictEqual(item.objectId('bf:status'), 'status:a')
          assert.strictEqual(item.literal('nypl:requestable'), true)
          // No restrictions:
          assert.strictEqual(item.objectId('nypl:accessMessage'), 'accessMessage:1')
          assert.strictEqual(item.literal('nypl:suppressed'), false)
        })
    })
  })

  describe('Item carrier, media type', function () {
    it('should assign correct carrier, media types based on item type', function () {
      var item = ItemSierraRecord.from(require('./data/item-10003973.json'))

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
          assert.strictEqual(item.objectId('nypl:bnum'), 'urn:bnum:b10006965')
          assert.strictEqual(item.objectId('nypl:catalogItemType'), 'catalogItemType:6')
          assert.strictEqual(item.objectId('nypl:owner'), 'orgs:1000')
          assert.strictEqual(item.literal('nypl:requestable'), true)
          assert.strictEqual(item.objectId('bf:media'), 'mediatypes:h')
          assert.strictEqual(item.objectId('bf:carrier'), 'carriertypes:hd')
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

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
          assert.strictEqual(item.literal('nypl:suppressed'), true)

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

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
          assert.strictEqual(item.literal('nypl:suppressed'), true)

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

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
          // Note we can't check 'nypl:catalogItemType' because almost nothing apart form nypl:suppressed is being serialized
          assert.strictEqual(item.literal('nypl:suppressed'), true)

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

        return itemSerializer.fromMarcJson(item, null, genericBib)
          .then((statements) => new Item(statements))
          .then((item) => {
            assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
            // Of the five values we setting, only '-' should cause item to be not suppressed
            assert.strictEqual(item.literal('nypl:suppressed'), code !== '-')

            // Because we modified the object, clear require cache
            delete require.cache[require.resolve('./data/item-10003973.json')]
          })
      }))
    })
  })

  describe('Complex Call Number Formatting', function () {
    it('should add call number prefix and suffixes', function () {
      const item = ItemSierraRecord.from(require('./data/item-33770493.json'))

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          assert.strictEqual(item.objectId('rdfs:type'), 'bf:Item')
          assert.strictEqual(item.objectId('nypl:owner'), 'orgs:1101')
          assert.strictEqual(item.objectId('nypl:holdingLocation'), 'loc:mall1')
          // Yeah i guess that's the actual call number?
          assert.strictEqual(item.literal('nypl:shelfMark'), '*R-RMRR PR451 .E553 2015 v. 3')
          assert.strictEqual(item.literal('bf:physicalLocation'), '*R-RMRR PR451 .E553 2015')
          assert.strictEqual(item.literal('bf:enumerationAndChronology'), 'v. 3')
          assert.strictEqual(item.objectId('nypl:bnum'), 'urn:bnum:b20857278')
        })
    })
  })

  describe('Volume Parsing', () => {
    it('should add parsed volume values from field tag v', async () => {
      const item = ItemSierraRecord.from(require('./data/item-10781594.json'))
      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          expect(item.literal('nypl:volumeRange')).to.deep.equal([2, 2])
        })
    })
  })

  describe('Date Parsing', () => {
    let item
    before(async () => {
      item = ItemSierraRecord.from(require('./data/item-with-fieldtagv-date.json'))
      sinon.stub(dateParse, 'checkCache').callsFake(() => [['1992-02', '1992-03']])
    })
    it('should add parsed dates from field tag v', async () => {
      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          expect(item.literal('nypl:dateRange')).to.deep.equal(['1992-02', '1992-03'])
        })
    })
  })

  describe('Harvard Integration', function () {
    it('should serialize HL HD record', function () {
      var item = ItemSierraRecord.from(require('./data/item-hl-231732642680003941.json'))

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          const statements = item.statements()
          expect(statements.length).to.be.above(9)

          expect(statements[0].subject_id).to.eq('hi231732642680003941')

          expect(item.objectId('nypl:accessMessage')).to.eq('accessMessage:1')
          expect(item.objectId('rdfs:type')).to.eq('bf:Item')
          expect(item.literal('nypl:shelfMark')).to.eq('Heb 14060.271.5')
          expect(item.literal('bf:physicalLocation')).to.eq('Heb 14060.271.5')
          expect(item.objectId('nypl:catalogItemType')).to.eq('catalogItemType:1')
          expect(item.objectId('nypl:bnum')).to.eq('urn:bnum:hb990000453050203941')

          expect(item.statements('dcterms:identifier')).to.be.a('array')
          expect(item.statements('dcterms:identifier')[0]).to.be.a('object')
          expect(item.statements('dcterms:identifier')[0].object_id).to.be.eq('HX328Q')
          expect(item.statements('dcterms:identifier')[0].object_type).to.be.eq('bf:Barcode')
        })
    })

    it('should serialize HL ReCAP record', function () {
      var item = ItemSierraRecord.from(require('./data/item-hl-232166335350003941.json'))

      return itemSerializer.fromMarcJson(item, null, genericBib)
        .then((statements) => new Item(statements))
        .then((item) => {
          const statements = item.statements()
          expect(statements.length).to.be.above(7)

          expect(statements[0].subject_id).to.eq('hi232166335350003941')

          expect(item.objectId('nypl:accessMessage')).to.eq('accessMessage:1')
          expect(item.objectId('rdfs:type')).to.eq('bf:Item')
          expect(item.objectId('nypl:catalogItemType')).to.eq('catalogItemType:1')
          expect(item.objectId('nypl:bnum')).to.eq('urn:bnum:hb990137923810203941')

          expect(item.statements('dcterms:identifier')).to.be.a('array')
          expect(item.statements('dcterms:identifier')[0]).to.be.a('object')
          expect(item.statements('dcterms:identifier')[0].object_id).to.be.eq('32044129177036')
          expect(item.statements('dcterms:identifier')[0].object_type).to.be.eq('bf:Barcode')
        })
    })
  })

  describe('Add Recap Code', () => {
    it('should add recap codes for nypl items - serial', async () => {
      let item = ItemSierraRecord.from(require('./data/item-10781594.json'))
      const statements = await itemSerializer.fromMarcJson(item, null, genericBib)
      item = new Item(statements)
      expect(item.statements('nypl:recapCustomerCode')).to.be.a('array')
      expect(item.statements('nypl:recapCustomerCode')[0]).to.be.a('object')
      expect(item.statements('nypl:recapCustomerCode')[0].object_literal).to.eq('recap')
    })

    it('should add recap codes for nypl item - monograph', async () => {
      let item = ItemSierraRecord.from(require('./data/item-10008083.json'))
      const statements = await itemSerializer.fromMarcJson(item, null, genericBib)
      item = new Item(statements)
      expect(item.statements('nypl:recapCustomerCode')).to.be.a('array')
      expect(item.statements('nypl:recapCustomerCode')[0]).to.be.a('object')
      expect(item.statements('nypl:recapCustomerCode')[0].object_literal).to.eq('recap')
    })

    it('should add recap codes for partner items', async () => {
      let item = ItemSierraRecord.from(require('./data/item-pul-189241'))
      const statements = await itemSerializer.fromMarcJson(item)
      item = new Item(statements)

      expect(item.statements('nypl:recapCustomerCode')[0].object_literal).to.be.eq('PA')
      expect(item.statements('nypl:recapCustomerCode')[0].source_record_path).to.be.eq('900 $b')
    })

    it('should not add recap codes for non-recap items', async () => {
      let item = ItemSierraRecord.from(require('./data/item-23971415'))
      const statements = await itemSerializer.fromMarcJson(item)
      item = new Item(statements)
      expect(!item.statements['nypl:recapCustomerCode'])
    })
  })

  describe('Add Aeon Site Code', () => {
    it('should add aeonSiteCode', async () => {
      let item = ItemSierraRecord.from(require('./data/item-aeon-eligible.json'))
      const statements = await itemSerializer.fromMarcJson(item)
      item = new Item(statements)
      expect(item.statement('nypl:aeonSiteCode')).to.be.a('object')
      expect(item.statement('nypl:aeonSiteCode').object_literal).to.eq('SCHRB')
    })
  })

  describe('Due date', () => {
    it('should not add dueDate when not checked out', async () => {
      let item = ItemSierraRecord.from(require('./data/item-23971415.json'))
      const statements = await itemSerializer.fromMarcJson(item)
      item = new Item(statements)
      expect(item.literal('nypl:dueDate')).to.be.a('undefined')
    })

    it('should add dueDate when one is found', async () => {
      let item = ItemSierraRecord.from(require('./data/item-15379839.json'))
      const statements = await itemSerializer.fromMarcJson(item)
      item = new Item(statements)
      expect(item.literal('nypl:dueDate')).to.be.eq('2022-09-26')
    })
  })
})
