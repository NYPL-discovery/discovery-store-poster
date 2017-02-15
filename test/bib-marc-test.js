/* global describe it */

// var request = require('request')
const assert = require('assert')
const MarcMapping = require('./../lib/field-mapping').MarcMapping
const bibSerializer = require('./../lib/serializers/bib')
const BibSierraRecord = require('./../lib/models/bib-sierra-record')
const Bib = require('./../lib/models/bib')

describe('Bib Marc Mapping', function () {
  this.timeout(1000)

  describe('Parse', function () {
    it('should parse marc mapping', function () {
      return MarcMapping.initialize().then(function (mapping) {
        assert(true)

        var altTitleMapping = mapping.allMappings('nypl-sierra').filter((m) => m.name === 'Alternative title')[0]
        // right number of alt title mappings:
        assert.equal(altTitleMapping.marcs.length, 5)

        var contribLIteralMapping = mapping.allMappings('nypl-sierra').filter((m) => m.name === 'Contributor literal')[0]
        assert.equal(contribLIteralMapping.marcs.length, 3)
      })
    })

    it('should identify var field', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10001936.json'))

      var val = bib.varField('856', null, { tagSubfields: true })
      assert.equal(val[0].u, 'http://hdl.handle.net/2027/nyp.33433001892276')
      assert.equal(val[0].z, 'Full text available via HathiTrust')
    })

    it('should extract e-item', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10001936.json'))

      return bibSerializer.extractElectronicResourcesFromBibMarc(bib)
        .then((resources) => {
          assert.equal(resources[0].url, 'http://hdl.handle.net/2027/nyp.33433001892276')
          assert.equal(resources[0].label, 'Full text available via HathiTrust')
          assert.equal(resources[0].path, '856')
          assert.equal(resources[0].type, 'ER')
        })
    })

    it('should extract e-item with mult urls', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10011374.json'))

      // console.log('bib: ', bib)
      return bibSerializer.extractElectronicResourcesFromBibMarc(bib)
        .then((resources) => {
          assert.equal(resources.length, 4)

          assert.equal(resources[0].url, 'http://hdl.handle.net/2027/nyp.33433057532081')
          assert.equal(resources[0].label, 'Full text available via HathiTrust--v. 1')
          assert.equal(resources[0].path, '856')
          assert.equal(resources[0].type, 'ER')

          assert.equal(resources[1].url, 'http://hdl.handle.net/2027/nyp.33433057532339')
          assert.equal(resources[1].label, 'Full text available via HathiTrust--v. 2')
          assert.equal(resources[1].path, '856')
          assert.equal(resources[1].type, 'ER')
        })
    })

    it('should extract many core properties', function () {
      var bib = BibSierraRecord.from(require('./data/bib-19995767.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // console.log('bib: ', bib)

          assert.equal(bib.objectId('rdf:type'), 'nypl:Item')
          assert.equal(bib.objectId('dcterms:type'), 'resourcetypes:txt')

          assert.equal(bib.objectId('bf:issuance'), 'urn:biblevel:m')
          assert.equal(bib.statement('bf:issuance').object_label, 'monograph/item')

          assert.equal(bib.objectId('bf:media'), 'mediatypes:h')
          assert.equal(bib.statement('bf:media').object_label, 'microform')

          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:he')
          assert.equal(bib.statement('bf:carrier').object_label, 'microfiche')

          assert.equal(bib.literal('dc:subject'), 'Board of Governors of the Federal Reserve System (U.S.)')
          assert.equal(bib.literals('dc:subject')[0], 'Board of Governors of the Federal Reserve System (U.S.)')
          assert.equal(bib.literals('dc:subject')[1], 'Dollar, American.')
          assert.equal(bib.literals('dc:subject')[2], 'Monetary policy -- United States.')
        })
    })

    it('should extract alt title', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10011745.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert(bib.literals('dcterms:alternative').indexOf('IJBD') >= 0)
          assert(bib.literals('dcterms:alternative').indexOf('Int. j. behav. dev.') >= 0)
          assert(bib.literals('dcterms:alternative').indexOf('International journal of behavioral development') >= 0)
        })
    })

    it('should extract contributor', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10011745.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // console.log('contribs: ', JSON.stringify(bib.statements('dc:contributor'), null, 2))
          // Note this is the pred for contributorLiteral:
          assert.equal(bib.literal('dc:contributor'), 'International Society for the Study of Behavioral Development.')
        })
    })

    it('should extract contributor role', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10392955.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('role:trl'), 'Fry, Christopher, 1907-2005,')
        })
    })

    it('should extract contributor role (2)', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10681848.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // console.log('contribs: ', JSON.stringify(bib.statements(), null, 2))
          assert.equal(bib.literal('role:win'), 'Bowness, Alan,')
          assert.equal(bib.literals('role:win')[1], 'Lambertini, Luigi,')
        })
    })

    it('should identify serial', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10019099.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Confirm issuance marks it as a serial:
          assert.equal(bib.objectId('bf:issuance'), 'urn:biblevel:s')

          // Serials are rdf:type Collection:
          assert.equal(bib.objectId('rdf:type'), 'nypl:Collection')
        })
    })

    it('should identify collection', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10737605.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Confirm issuance marks it as a collection:
          assert.equal(bib.objectId('bf:issuance'), 'urn:biblevel:c')

          // Serials are rdf:type Collection:
          assert.equal(bib.objectId('rdf:type'), 'nypl:Collection')
        })
    })
  })
})

