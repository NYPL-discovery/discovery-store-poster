/* global describe it */

const assert = require('assert')
const holdingSerializer = require('./../lib/serializers/holding')
const HoldingSierraRecord = require('./../lib/models/holding-sierra-record')
const Holding = require('./../lib/models/holding')
const buildMapper = require('./../lib/field-mapper')

describe('Holding Marc Mapping', () => {
  describe('Parse', function () {
    it('parses suppressed/deleted as suppressed', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1080389-deleted.json'))
      assert(holding.suppressed, true)
      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.equal(holding.literal('nypl:suppressed'), true)
        })
    })

    it('should parse marc mapping', () => {
      const mapper = buildMapper('holding', null)

      const mapping = mapper.getMapping('Holding Statement')
      assert.equal(mapping.paths.length, 5)
      assert.equal(mapping.paths[0].marc, '866')
      assert.equal(mapping.paths[2].marc, '863')
    })

    it('should extract certain basic holding props', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1082762.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.equal(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.equal(holding.objectId('nypl:bnum'), 'urn:bnum:b14630864')
          assert.equal(holding.objectId('nypl:holdingLocation'), 'loc:mal')
          assert.equal(holding.literal('nypl:shelfMark'), 'JBM 00-489')
        })
    })

    it('should extract format statements from legacy i fieldTag', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1082762.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.literal('dcterms:format'), 'PRINT')
        })
    })

    it('should create multiple shelfMarks that include prefixes and suffixes', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1089484.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.equal(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.equal(holding.objectId('nypl:bnum'), 'urn:bnum:b16543663')
          assert.equal(holding.literals('nypl:shelfMark')[0], '*R-SIBL NK9509 .T722 Latest ed.')
          assert.equal(holding.literals('nypl:shelfMark')[1], 'JBM 07-158 Bound vols.')
        })
    })

    it('should create multiple holdings statements for all supplied fields', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1089484.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.equal(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.equal(holding.objectId('nypl:bnum'), 'urn:bnum:b16543663')
          assert.equal(holding.literals('dcterms:coverage')[0], '[Bound vols.-SIBL Delivery Desk] ed. 14 (2007)-ed. 19 (2013),')
          assert.equal(holding.literals('dcterms:coverage')[1], 'ed.  20 (2015)')
        })
    })

    it('should create blank nodes for all supplied check in boxes', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1089484.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.equal(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.equal(holding.objectId('nypl:bnum'), 'urn:bnum:b16543663')

          const checkInBox1 = holding.blankNodes('dcterms:hasPart')[0]
          assert.equal(checkInBox1.objectId('rdf:type'), 'nypl:CheckInBox')
          assert.equal(checkInBox1.literal('dcterms:coverage'), '20 (--)')
          assert.equal(checkInBox1.literal('bf:status'), 'Bound')
          assert.equal(checkInBox1.literal('bf:count'), undefined)
          assert.equal(checkInBox1.literal('bf:part'), 1)

          const checkInBox2 = holding.blankNodes('dcterms:hasPart')[1]
          assert.equal(checkInBox2.objectId('rdf:type'), 'nypl:CheckInBox')
          assert.equal(checkInBox2.literal('dcterms:coverage'), '21 (--)')
          assert.equal(checkInBox2.literal('bf:status'), 'Expected')
          assert.equal(checkInBox2.literal('bf:count'), undefined)
          assert.equal(checkInBox2.literal('bf:part'), 2)
        })
    })

    it('should create multiple note statements', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1066022.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.equal(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.equal(holding.objectId('nypl:bnum'), 'urn:bnum:b11929657')
          assert.equal(holding.literals('bf:note')[0], 'Checkin **EDITION SPECIALE** here.')
          assert.equal(holding.literals('bf:note')[1], 'IRREGULAR')
        })
    })
  })
})
