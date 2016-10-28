'use strict'

const _ = require('highland')

const FieldMapping = require('./field-mapping').FieldMapping
const MarcMapping = require('./field-mapping').MarcMapping
const db = require('./db')
const Lookup = require('./lookup')

const imageDimensions = require('./utils').imageDimensions

var sourcePrefix = (object) => {
  return object.nyplSource.match(/recap-[PC]/) ? object.nyplSource.substring(6, 7).toLowerCase() : ''
}

class PcdmSerializer {

  constructor (obj) {
    this.statements = {}
    this.uri = null

    // not sure we need these?
    // this.allAgents = []
    // this.allTerms = []

    this.object = obj

    // this.addStatement('dc:title
  }

  addStatement (predicate, object, provo) {
    var statement = this.buildObject(object, provo)

    if (!this.statements[predicate]) this.statements[predicate] = []
    this.statements[predicate].push(statement)
    return this
  }

  buildObject (object, provo) {
    provo = provo || {}
    provo = Object.assign({
      creator: 'RI',
      created: new Date(),
      source: 'data:10002',
      recordIdentifier: null
    }, provo)

    var statement = (typeof object === 'string') ? object : Object.assign({
      objectUri: null,
      objectLiteral: null,
      objectLiteralType: null,
      label: null,
      provo: [provo]
    }, object)

    return statement
  }
}

PcdmSerializer.mergeStatements = (statements) => {
  var merged = Object.assign.apply(null, statements)
  return merged
}

PcdmSerializer.sortStatements = (statements) => {
  return Object.keys(statements).sort().reduce((r, k) => (r[k] = statements[k], r), {})
}

class PcdmLocationSerializer extends PcdmSerializer {
  serialize () {
    return FieldMapping.initialize('locations').then((fieldMapper) => {
      try {
        var predicate = null

        this.statements['uri'] = this.object.code
        this.statements['rdf:type'] = ['nypl:Location']

        // TODO this should dynamically look up dataset record:
        var provo = { source: 'data:1002', recordIdentifier: this.object.code }

        predicate = fieldMapper.predicateFor('Code')
        this.addStatement(predicate, { objectLiteral: this.object.code }, provo)

        predicate = fieldMapper.predicateFor('Location type')
        this.addStatement(predicate, { objectUri: this.object.location_type || 'branch' }, provo)

        predicate = fieldMapper.predicateFor('Preferred label')
        this.addStatement(predicate, { objectLiteral: this.object.label }, provo)

        if (this.object.actual_location) {
          predicate = fieldMapper.predicateFor('Actual location')
          this.addStatement(predicate, { objectLiteral: this.object.actual_location }, provo)
        }

        return Promise.resolve(this.statements)
      } catch (e) {
        return Promise.reject(e)
      }
    })
  }
}

PcdmLocationSerializer.serialize = (obj) => {
  return (new PcdmLocationSerializer(obj)).serialize()
}


class PcdmItemSerializer extends PcdmSerializer {
  serialize () {
    return FieldMapping.initialize('resources').then((fieldMapper) => {
      try {
        this.statements['rdf:type'] = 'nypl:Item'

        // TODO: implement minting ids?
        this.statements['uri'] = `${sourcePrefix(this.object)}i${this.object.id}`

        var provo = { source: 'data:1002', recordIdentifier: this.object.id }

        // Availability
        // TODO: temp predicate?
        if (this.object.status && this.object.status.display) {
          this.addStatement('bf:status', { objectUri: `status:${this.object.status.display}`, label: this.object.status.display }, provo)
        }

        // Bnumber identifier(s)
        _([this.object.bibIds]).flatten().compact().each((bibId) => {
          this.addStatement(fieldMapper.predicateFor('Identifier'), { objectUri: `urn:bnum:${bibId}` }, provo)
        })

        if (this.object.barcode) {
          this.addStatement(fieldMapper.predicateFor('Identifier'), { objectUri: `urn:barcode:${this.object.barcode}` }, provo)
        }
        if (this.object.callNumber) {
          this.addStatement(fieldMapper.predicateFor('Call number'), { objectLiteral: this.object.callNumber }, provo)
        }

        // Even though the above require no lookups, make them a promise so they can be merged w/lookups below
        var promises = [Promise.resolve(this.statements)]

        // Location
        if (this.object.location) {
          promises.push(
            db.locations.findOne({ uri: this.object.location.code })
              .then((rec) => {
                // console.log('rec: ', rec)
                if (rec) {
                  var statement = this.buildObject({ objectUri: `loc:${rec.uri}`, label: this.object.location.name })
                  this.addStatement(fieldMapper.predicateFor('Location'), statement, provo)
                }
              })
          )
        }

        // Await all resolution promises:
        return Promise.all(promises).then((statements) => {
          return PcdmSerializer.sortStatements(this.statements)
        })
      } catch (e) {
        return Promise.reject(e)
      }
    })
  }
}

class PcdmBibSerializer extends PcdmSerializer {
  serialize () {
    return FieldMapping.initialize('resources').then((fieldMapper) => {
      try {
        this.statements['rdf:type'] = 'nypl:Bib'

        this.statements['uri'] = `${sourcePrefix(this.object)}b${this.object.id}`

        var provo = { source: 'data:1002', recordIdentifier: this.object.id }

        // Bnumber identifier
        this.addStatement(fieldMapper.predicateFor('Identifier'), { objectUri: `urn:bnum:${this.object.id}` }, provo)

        // Title
        this.addStatement(fieldMapper.predicateFor('Title'), { objectLiteral: this.object.title, objectLiteralType: 'xsd:string' }, provo)

        // Suppressed
        this.addStatement(fieldMapper.predicateFor('Suppressed'), { objectLiteral: this.object.suppressed, objectLiteralType: 'xsd:boolean' }, provo)

        // Language
        if (this.object.lang) {
          _([this.object.lang]).flatten().each((lang) => {
            this.addStatement(fieldMapper.predicateFor('Language'), { label: lang.name, objectUri: `lang:${lang.code}` }, provo)
          })
        }

        // Contributors
        if (this.object.author) {
          _([this.object.author]).flatten().each((author) => {
            this.addStatement(fieldMapper.predicateFor('Contributor literal'), { objectLiteral: author, objectLiteralType: 'xsd:string' }, provo)
          })
        }

        if (this.object.publishYear) {
          ['Date start', 'Date created', 'Date'].forEach((relationship) => {
            this.addStatement(fieldMapper.predicateFor(relationship), { objectLiteral: this.object.publishYear, objectLiteralType: 'xsd:integer' }, provo)
          })
        }

        // Even though the above require no lookups, make them a promise so they can be merged w/lookups below
        var promises = [Promise.resolve(this.statements)]

        // Parse var fields
        promises.push(MarcMapping.initialize().then((marcMapper) => {
          marcMapper.allMappings().filter((mapping) => {
            // Don't pull these from marc cause we already have them (or handled below)
            return ['Carrier type', 'Type', 'Availability', 'Barcode', 'Call number', 'Date', 'Date created', 'Date start', 'Date end', 'Title', 'Language'].indexOf(mapping.name) < 0
          }).map((mapping) => {
            // Override: Subjects coming out of Sierra are actually just literals
            if (mapping.name === 'Subject') mapping.predicate = 'dc:subject'
            if (mapping.name === 'Contributor') mapping.predicate = 'dc:contributor'
            if (mapping.name === 'Publisher') mapping.predicate = 'nypl:role-publisher'
            return mapping
          }).forEach((mapping) => {
            mapping.marc.forEach((marc) => {
              var values = null
              values = this.object.varField(marc, mapping.subfields)
              if (values.length) values.forEach((value) => this.addStatement(mapping.predicate, { objectLiteral: value, label: mapping.description }), provo)
            })
          })

          var values = null
          var mapping = null

          // Carrier type
          if (this.object.varField(338, ['b', 'a'])) {
            values = this.object.varField('338', ['b', 'a'], { tagSubfields: true })
            mapping = marcMapper.specFor('Carrier type')
            // console.log('carrier: ', values)
            values.forEach((val) => {
              this.addStatement(mapping.predicate, { objectUri: `carriertypes:${val.b}`, label: val.a }, provo)
            })
          }

          // Media type
          if (this.object.varField(337, ['b', 'a'])) {
            values = this.object.varField('337', ['b', 'a'], { tagSubfields: true })
            mapping = marcMapper.specFor('Media type')
            values.forEach((val) => {
              this.addStatement(mapping.predicate, { objectUri: `mediatypes:${val.b}`, label: val.a }, provo)
            })
          }
        }))

        // Fixed fields
        // Material type
        // if (this.object.fixed('Material Type')) {
          // Redundant, cause pulling it from ldr below
          // this.addStatement(fieldMapper.predicateFor('Resource type'), { objectUri: `urn:resourcetypes:${this.object.fixed('Material Type')}` })
        // }

        // LDR fields
        if (this.object.ldr()) {
          if (this.object.ldr().bibLevel) {
            promises.push(Lookup.initialize('bib-levels').then((lookup) => {
              var bibLevel = this.object.ldr().bibLevel
              this.addStatement(fieldMapper.predicateFor('Issuance'), { objectUri: `urn:biblevel:${bibLevel}`, label: lookup.lookup(bibLevel) }, provo)
            }))
          }
          // Record type
          if (this.object.ldr().recType) {
            promises.push(Lookup.initialize('rectypes-to-resource-types').then((lookup) => {
              var recType = this.object.ldr().recType
              var dcterm = lookup.lookup(recType)
              if (!dcterm) return Promise.resolve(null)

              return Lookup.initialize('resource-types').then((lookup) => {
                var label = lookup.lookup(dcterm)
                this.addStatement(fieldMapper.predicateFor('Resource type'), { objectUri: `resourcetypes:${dcterm}`, label: label }, provo)
              })
            }))
          }
        }

        var urls = [`http://s3.amazonaws.com/data.nypl.org/bookcovers/${this.object.id}.jpg`, `http://s3.amazonaws.com/data.nypl.org/bookcovers/${this.object.id}_ol.jpg`]
        promises.push(Promise.all(urls.map(imageDimensions)).then((sizes) => {
          // console.log('Checked image urls: ', JSON.stringify(sizes, null, 2))
          var best = sizes.filter((s) => s.dimensions).sort((s1, s2) => {
            if (s1.dimensions.width * s1.dimensions.height > s2.dimensions.width * s2.dimensions.height) return 1
            return -1
          })[0]
          // console.log('  Best', JSON.stringify(best, null, 2))
          if (best) {
            var url = best.url
            this.addStatement(fieldMapper.predicateFor('Cover image'), { objectLiteral: url }, provo)
          }
        }))

        // Await all resolution promises:
        return Promise.all(promises).then(() => {
          return PcdmSerializer.sortStatements(this.statements)
        })
      } catch (e) {
        return Promise.reject(e)
      }
    })
  }
}

PcdmBibSerializer.serialize = (obj) => {
  return (new PcdmBibSerializer(obj)).serialize()
}

PcdmItemSerializer.serialize = (obj) => {
  return (new PcdmItemSerializer(obj)).serialize()
}

module.exports = { PcdmBibSerializer, PcdmItemSerializer, PcdmLocationSerializer }
