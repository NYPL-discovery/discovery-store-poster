/* global describe it */

const assert = require('assert')
const BibFieldMapper = require('./../lib/field-mapper').BibFieldMapper
const bibSerializer = require('./../lib/serializers/bib')
const BibSierraRecord = require('./../lib/models/bib-sierra-record')
const Bib = require('./../lib/models/bib')

describe('Bib Marc Mapping', function () {
  this.timeout(1000)

  describe('Parse', function () {
    it('should parse marc mapping', function () {
      var mapping = new BibFieldMapper('sierra-nypl')

      var altTitleMapping = mapping.getMapping('Alternative title')
      // right number of alt title mappings:
      assert.equal(altTitleMapping.paths.length, 5)

      var contribLIteralMapping = mapping.getMapping('Contributor literal')
      assert.equal(contribLIteralMapping.paths.length, 3)
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

    it('should extract many core properties from a MICROFORM', function () {
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

          // Material Type is 'h' and 007/00-01 == he, so:
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:he')
          assert.equal(bib.statement('bf:carrier').object_label, 'microfiche')

          assert.equal(bib.literal('dc:subject'), 'Board of Governors of the Federal Reserve System (U.S.)')
          assert.equal(bib.literals('dc:subject')[0], 'Board of Governors of the Federal Reserve System (U.S.)')
          assert.equal(bib.literals('dc:subject')[1], 'Dollar, American.')
          assert.equal(bib.literals('dc:subject')[2], 'Monetary policy -- United States.')

          // Creator literal:
          assert.equal(bib.literals('dc:creator')[0], 'United States. Congress. Joint Economic Committee, author.')
        })
    })

    it('should extract many core properties (2)', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10011374.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // console.log('bib: ', bib)
          assert.equal(bib.literals('nypl:shelfMark')[0], 'JFE 86-498')
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

          // Material Type is 'h' and has 007/00-01 == hd, so so carrier type should be hd
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:hd')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:h')
          assert.equal(bib.statement('bf:carrier').object_label, 'microfilm reel')
        })
    })

    it('should map carrier type, dimensions, extent', function () {
      var bib = BibSierraRecord.from(require('./data/bib-18501478.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'n', so carrier type should be cr (note that 007/00-01 == cr anyway)
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:cr')
          assert.equal(bib.statement('bf:carrier').object_label, 'online resource')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:c')

          assert.equal(bib.literal('bf:dimensions'), '24 cm.')
          assert.equal(bib.literal('nypl:extent'), 'v. ;')
        })
    })

    it('should map vhs carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-20169090.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 's' (VHS), so carrier type should be vf
          assert.equal(bib.objectId('bf:media'), 'mediatypes:v')
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:vf')
          assert.equal(bib.statement('bf:carrier').object_label, 'videocassette')
        })
    })

    it('should map teacher set carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-19818041.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is '-', so carrier type should be zu
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:zu')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:z')
          assert.equal(bib.statement('bf:carrier').object_label, 'unspecified')
        })
    })

    it('should map DVD carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-12157346.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'v' (DVD), so carrier type should be vd
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:vd')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:v')
          assert.equal(bib.statement('bf:carrier').object_label, 'videodisc')
        })
    })

    it('should map BLU-RAY carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-20289329.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'b' (blu-ray), so carrier type should be vd
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:vd')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:v')
          assert.equal(bib.statement('bf:carrier').object_label, 'videodisc')
        })
    })

    it('should map MUSIC NON-CD carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11070917.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'j' (music non-cd) and 007/00-01 == 'sd', so carrier type should be:
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:sd')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:s')
          assert.equal(bib.statement('bf:carrier').object_label, 'audio disc')
        })
    })

    it('should map SPOKEN WORD carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11079574.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'i' (spoken word) and no 007, so default 'sz'
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:sz')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:s')
          assert.equal(bib.statement('bf:carrier').object_label, 'other audio carrier')
        })
    })

    it('should map FILM, SLIDE, ETC. carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11253008.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'g' (film / slide) and 007/00-01 == vf so:
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:vf')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:v')
          assert.equal(bib.statement('bf:carrier').object_label, 'videocassette')
        })
    })

    it('should map COMPUTER FILE (cd) carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-13706421.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'm' (computer file) and 007/01 == o so cd:
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:cd')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:c')
          assert.equal(bib.statement('bf:carrier').object_label, 'computer disc')
        })
    })

    it('should map MANUSCRIPT carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-20827868.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 't' (manuscript) and 338b === nc (which is fallback anyway) so:
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:nc')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:n')
          assert.equal(bib.statement('bf:carrier').object_label, 'volume')
        })
    })

    it('should identify bib carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10001936.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'a' and no 007 or 338, so carrier type should be nc
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:nc')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:n')
          assert.equal(bib.statement('bf:carrier').object_label, 'volume')
        })
    })
  })
})

