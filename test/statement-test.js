const expect = require('chai').expect
const Statement = require('./../lib/models/statement')

describe('Statement', function () {
  describe('builder', function () {
    let builder = null

    beforeEach(() => {
      builder = Statement.builder('subject-id', 'serializer-id', { id: 'source-id', record_id: 'source-record-id' })
    })

    it('should accept object_id statement', function () {
      builder.add('namespace:pred', { id: 'object-id', type: 'object-type' }, 0, { path: 'source-path' })

      expect(builder.statements).to.be.a('array')
      expect(builder.statements).to.have.lengthOf(1)
      expect(builder.statements[0]).to.be.a('object')
      expect(builder.statements[0]).to.include({
        subject_id: 'subject-id',
        object_id: 'object-id',
        object_type: 'object-type',
        source_id: 'source-id',
        source_record_id: 'source-record-id',
        source_record_path: 'source-path'
      })
    })

    it('should accept object_literal statement', function () {
      builder.add('namespace:pred', { literal: 'object literal value', type: 'object-type' }, 0, { path: 'source-path' })

      expect(builder.statements).to.be.a('array')
      expect(builder.statements).to.have.lengthOf(1)
      expect(builder.statements[0]).to.be.a('object')
      expect(builder.statements[0]).to.include({
        subject_id: 'subject-id',
        object_literal: 'object literal value',
        object_type: 'object-type',
        source_id: 'source-id',
        source_record_id: 'source-record-id',
        source_record_path: 'source-path'
      })
    })

    it('should throw appropriate error if both object_literal and object_id null', function () {
      const badAdd = () => builder.add('namespace:pred', { type: 'object-type' }, 0, { path: 'source-path' })
      expect(badAdd).to.throw('Statement.builder error: invalid object')
    })

    it('should throw appropriate error if object_literal falsey but object_type isn\'t xsd:boolean', function () {
      const badAdd = () => builder.add('namespace:pred', { literal: false, type: 'xsd:string' }, 0, { path: 'source-path' })
      expect(badAdd).to.throw('Statement.builder error: invalid object')
    })

    it('should allow falsy object_literal if object_type xsd:boolean', function () {
      const badAdd = () => builder.add('namespace:pred', { literal: false, type: 'xsd:boolean' }, 0, { path: 'source-path' })
      expect(badAdd).to.not.throw('Statement.builder error: invalid object')
    })

    it('should throw appropriate error if predicate too long', function () {
      // Create a string strictly larger than predicate col width:
      const longPredicate = '-'.repeat(51)

      const badAdd = () => builder.add(longPredicate, { id: 'object-id', type: 'object-type' }, 0, { path: 'source-path' })

      expect(badAdd).to.throw('Statement.builder error: length of predicate')
    })

    it('should throw appropriate error if object_id too long', function () {
      // Create a string strictly larger than object_id col width:
      const objectIdOfLength513 = '-'.repeat(513)

      const badAdd = () => builder.add('namespace:pred', { id: objectIdOfLength513, type: 'object-type' }, 0, { path: 'source-path' })

      expect(badAdd).to.throw('Statement.builder error: length of object_id')
    })
  })
})
