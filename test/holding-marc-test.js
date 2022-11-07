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
          assert.strictEqual(holding.literal('nypl:suppressed'), true)
        })
    })

    it('should parse marc mapping', () => {
      const mapper = buildMapper('holding', null)

      const mapping = mapper.getMapping('Holding Statement')
      assert.strictEqual(mapping.paths.length, 5)
      assert.strictEqual(mapping.paths[0].marc, '866')
      assert.strictEqual(mapping.paths[2].marc, '863')
    })

    it('should extract certain basic holding props', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1082762.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.strictEqual(holding.objectId('nypl:bnum'), 'urn:bnum:b14630864')
          assert.strictEqual(holding.objectId('nypl:holdingLocation'), 'loc:mal')
          assert.strictEqual(holding.literal('nypl:shelfMark'), 'JBM 00-489')
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
          assert.strictEqual(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.strictEqual(holding.objectId('nypl:bnum'), 'urn:bnum:b16543663')
          assert.strictEqual(holding.literals('nypl:shelfMark')[0], '*R-SIBL NK9509 .T722 Latest ed.')
          assert.strictEqual(holding.literals('nypl:shelfMark')[1], 'JBM 07-158 Bound vols.')
        })
    })

    it('should create multiple holdings statements for all supplied fields', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1089484.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.strictEqual(holding.objectId('nypl:bnum'), 'urn:bnum:b16543663')
          assert.strictEqual(holding.literals('dcterms:coverage')[0], '[Bound vols.-SIBL Delivery Desk] ed. 14 (2007)-ed. 19 (2013),')
          assert.strictEqual(holding.literals('dcterms:coverage')[1], 'ed.  20 (2015)')
        })
    })

    it('should create blank nodes for all supplied check in boxes', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1089484.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.strictEqual(holding.objectId('nypl:bnum'), 'urn:bnum:b16543663')

          const checkInBox1 = holding.blankNodes('dcterms:hasPart')[0]
          assert.strictEqual(checkInBox1.objectId('rdf:type'), 'nypl:CheckInBox')
          assert.strictEqual(checkInBox1.literal('dcterms:coverage'), '20 (--)')
          assert.strictEqual(checkInBox1.literal('bf:status'), 'Bound')
          assert.strictEqual(checkInBox1.literal('bf:count'), undefined)
          assert.strictEqual(checkInBox1.literal('bf:part'), 1)

          const checkInBox2 = holding.blankNodes('dcterms:hasPart')[1]
          assert.strictEqual(checkInBox2.objectId('rdf:type'), 'nypl:CheckInBox')
          assert.strictEqual(checkInBox2.literal('dcterms:coverage'), '21 (--)')
          assert.strictEqual(checkInBox2.literal('bf:status'), 'Expected')
          assert.strictEqual(checkInBox2.literal('bf:count'), undefined)
          assert.strictEqual(checkInBox2.literal('bf:part'), 2)
        })
    })

    it('should create item statements for each checkin card box', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1089484.json'))
      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => {
          // assert that both checkin cards got processed
          assert(statements.some((statement) => statement.subject_id.includes('-0')))
          assert(statements.some((statement) => statement.subject_id.includes('-1')))
          // assert that all statements were added
          assert(statements.some((statement) => statement.predicate.includes('volumeRange')))
          assert(statements.some((statement) => statement.predicate.includes('volumeRaw')))
          assert(statements.some((statement) => statement.predicate.includes('dateRange')))
          assert(statements.some((statement) => statement.predicate.includes('status')))
          assert(statements.some((statement) => statement.predicate.includes('shelfMark')))
          assert(statements.some((statement) => statement.predicate.includes('format')))
          assert(statements.some((statement) => statement.predicate.includes('accessMessage')))
          assert(statements.some((statement) => statement.predicate.includes('enumerationAndChronology')))
        })
    })

    it('should create multiple note statements', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1066022.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.strictEqual(holding.objectId('nypl:bnum'), 'urn:bnum:b11929657')
          assert.strictEqual(holding.literals('bf:note')[0], 'Checkin **EDITION SPECIALE** here.')
          assert.strictEqual(holding.literals('bf:note')[1], 'IRREGULAR')
        })
    })
  })
})
