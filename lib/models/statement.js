const utils = require('../utils')

const DB_COLUMN_WIDTHS = {
  subject_id: 100,
  predicate: 50,
  object_id: 512,
  object_type: 50,
  source_record_id: 50,
  source_record_path: 50
}

class Statement {
  constructor (props) {
    for (var k in props) {
      this[k] = props[k]
    }
    if (!this.subject_id) throw new Error('Statement.builder error: subject_id missing')
    if (!this.predicate) throw new Error(`Statement.builder error: predicate missing for subject_id ${this.subject_id}`)
    if (!this.object_id && this.object_literal === null) throw new Error(`Statement.builder error: no object id/literal given for predicate "${this.predicate}"`)

    // Check lengths of values against known column width constraints:
    Object.keys(DB_COLUMN_WIDTHS).forEach((columnName) => {
      const columnWidth = DB_COLUMN_WIDTHS[columnName]
      if (this[columnName] && this[columnName].length > columnWidth) {
        throw new Error(`Statement.builder error: length of ${columnName} value exceeds ${columnWidth}: "${this[columnName]}"`)
      }
    })
  }
}

/**
 * A statement builder is an object initialized with a fixed creator_id and
 * base_source_hash, which ensures that an `add` (or `addBlankNode`) calls
 * made upon it use that baseline provenance info in generated statements.
 */
Statement.builder = (subject_id, creator_id, base_source_hash) => {
  if (!base_source_hash.id) throw new Error(subject_id + ': no source_id given')
  if (!creator_id) throw new Error(subject_id + ': no creatord_id given')

  let blankNodeCount = 0

  return new function () {
    this.statements = []

    /**
     *  For adding a single statmement
     *
     *  @example
     *  // This sets title 0 for subject 's1', recording the source marc "path":
     *  builder.add('dcterms:title', { literal: 'Title of obj' }, 0, { path: '245 $a $b' })
     */
    this.add = (predicate, object, index, source_hash) => {
      source_hash = Object.assign({}, base_source_hash, source_hash)

      if (index === null || (typeof index) !== 'number') {
        var matching = (this.getAll(predicate) || []).filter((s) => {
          if (object.literal) return object.literal === s.object_literal
          else return object.id === s.object_id
        })[0]
        if (matching) index = matching.index
        else index = (this.getAll(predicate) || []).length
      }

      if ((typeof index) !== 'number') throw new Error(`Statement.builder error: no index given for predicate "${predicate}"`)
      if (!object || (!object.id && !object.literal && object.type !== 'xsd:boolean')) throw new Error(`Statement.builder error: invalid object: ${JSON.stringify(object, null, 2)} for subject_id "${subject_id}", predicate "${predicate}"`)
      if (!source_hash || !source_hash.record_id) throw new Error(`Statement.builder error: ${predicate}: no record_id given`)

      this._addStatement(subject_id, predicate, object, index, source_hash)
    }

    /**
     *  For adding a blank node.
     *
     *  Blank nodes are implemented as:
     *   - one statement linking the primary subject to the blank node by id
     *   - any number of statements about the blank node itself
     *
     *  Blank node ids are built using: [primary subject id]#[creator id].[padded index]
     *
     *  @example
     *  // This adds a blank node for subject 's1' representing a Note.
     *  let blankNode = {
     *    'rdfs:type': { id: 'bf:Note' },
     *    'bf:noteType': { literal: 'General Note' },
     *    'rdfs:label': { literal: 'American Masters, Thirteen/WNET.' }
     *  }
     *  builder.addBlankNode('skos:note', blankNode, 0, { path: '500 $a'})
     *
     *  For primary subject 's1', the records generated above might be:
     *   - subject_id: 's1', predicate: 'skos:note', object_id: 's1#1.0000', ...
     *   - subject_id: 's1#1.0000', predicate: 'rdfs:type', object_id: 'bf:Note', ...
     *   - subject_id: 's1#1.0000', predicate: 'bf:noteType', object_literal: 'General Note', ...
     *   - subject_id: 's1#1.0000', predicate: 'rdfs:label', object_literal: 'American Masters, Thirteen/WNET.', ...
     */
    this.addBlankNode = (predicate, blankNode, index, source_hash) => {
      source_hash = Object.assign({}, base_source_hash, source_hash)

      // Generate locally unique id
      const suffix = utils.lpad(String(blankNodeCount), 4, '0')
      const blankNodeId = `${subject_id}#${creator_id}.${suffix}`

      // Link main record to blank node:
      this.add(predicate, { id: blankNodeId }, index, source_hash)

      Object.keys(blankNode).forEach((predicate) => {
        // Add blank node statements:
        this._addStatement(blankNodeId, predicate, blankNode[predicate], index, source_hash)
      })

      blankNodeCount += 1
    }

    /**
     *  For adding a single statmement (internal use)
     *
     *  @example
     *  // This sets title 0 for subject 's1':
     *  builder._addStatement('s1', 'dcterms:title', { literal: 'Title of obj' }, 0, { id: 'sourcedbid', record_id: 'sourcerecordid' })
     */
    this._addStatement = (subject_id, predicate, object, index, source_hash) => {
      var props = {
        subject_id,
        predicate,
        source_id: source_hash.id,
        source_record_id: source_hash.record_id,
        creator_id,
        index
      }

      if (object.id) props.object_id = object.id
      // Respect standing db constraints:
      if (object.label) props.object_label = object.label
      if (object.literal || object.type === 'xsd:boolean') props.object_literal = object.literal
      if (object.type) props.object_type = object.type
      // Should come up with a more compact representation, perhaps, because
      // we have to truncate in some cases:
      if (source_hash.path) props.source_record_path = utils.truncate(source_hash.path, 50, '..')

      var statement = new Statement(props)
      this.statements.push(statement)
    }

    this.getAll = (pred) => this.statements.filter((s) => s.predicate === pred)
    this.get = (pred) => this.getAll(pred)[0]
  }
}

module.exports = Statement
